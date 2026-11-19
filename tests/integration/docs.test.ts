/* eslint-disable @typescript-eslint/no-explicit-any -- walking a loosely typed OpenAPI document */
// Swagger must describe the API that really exists. These tests fail the moment
// a route is added, removed or renamed without updating src/docs/openapi.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApp } from '../helpers.ts';

type TestApp = Awaited<ReturnType<typeof startTestApp>>;
let t: TestApp;
let doc: typeof import('../../src/docs/openapi.ts').openApiDocument;

before(async () => {
  t = await startTestApp();
  ({ openApiDocument: doc } = await import('../../src/docs/openapi.ts'));
});
after(() => t.stop());

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

// Every route Express really has, as "POST /auth/login" (params as {userId}).
function realRoutes(): Set<string> {
  const found = new Set<string>();
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          found.add(`${method.toUpperCase()} ${layer.route.path.replace(/:(\w+)/g, '{$1}')}`);
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((t.app as unknown as { router: { stack: Layer[] } }).router.stack);
  found.delete('GET /openapi.json'); // the docs endpoint itself
  return found;
}

function documentedRoutes(): Set<string> {
  const found = new Set<string>();
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of Object.keys(item)) found.add(`${method.toUpperCase()} ${path}`);
  }
  return found;
}

describe('swagger matches the API', () => {
  it('documents every real route, and nothing that does not exist', () => {
    const real = [...realRoutes()].sort();
    const documented = [...documentedRoutes()].sort();
    assert.deepEqual(documented, real);
  });

  it('every $ref points at something that exists', () => {
    const text = JSON.stringify(doc);
    for (const [, name] of text.matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)) {
      assert.ok(name && name in doc.components.schemas, `missing schema ${name}`);
    }
  });

  it('every operation has a summary, a tag and responses; security names exist', () => {
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(item) as [string, Record<string, any>][]) {
        const where = `${method.toUpperCase()} ${path}`;
        assert.ok(op.summary, `${where}: summary`);
        assert.ok(op.tags?.length, `${where}: tags`);
        assert.ok(Object.keys(op.responses ?? {}).length, `${where}: responses`);
        for (const requirement of op.security ?? []) {
          for (const scheme of Object.keys(requirement)) {
            assert.ok(scheme in doc.components.securitySchemes, `${where}: scheme ${scheme}`);
          }
        }
        if (op.security?.length) assert.ok(op.responses['401'] || op.responses['200'], where);
      }
    }
  });

  it('routes behind login document a 401, and rate-limited routes document a 429', () => {
    const protectedPaths = ['/auth/logout-all', '/auth/me', '/admin/consultants'];
    for (const p of protectedPaths) {
      const op = Object.values((doc.paths as any)[p])[0] as any;
      assert.ok(op.responses['401'], `${p} must document 401`);
    }
    for (const p of ['/auth/register', '/auth/register/verify', '/auth/login', '/auth/refresh']) {
      const op = (doc.paths as any)[p].post;
      assert.ok(op.responses['429'], `${p} must document 429`);
    }
  });

  it('documented request bodies match what the API really accepts', async () => {
    const bodyProps = (path: string) =>
      Object.keys(
        (doc.paths as any)[path].post.requestBody.content['application/json'].schema.properties,
      ).sort();
    assert.deepEqual(bodyProps('/auth/register'), ['email', 'name', 'password', 'role']);
    assert.deepEqual(bodyProps('/auth/register/verify'), ['email', 'otp']);

    // And the API agrees: a documented field missing, or an undocumented one, is a 400.
    const c = t.client();
    assert.equal((await c.call('POST', '/auth/register', { email: 'a@test.dev' })).status, 400);
    const undocumented = {
      name: 'A',
      email: 'a@test.dev',
      password: 'password123',
      role: 'customer',
      isValid: true,
    };
    assert.equal((await c.call('POST', '/auth/register', undocumented)).status, 400);
    assert.equal(
      (
        await c.call('POST', '/auth/register/verify', {
          email: 'a@test.dev',
          otp: '123456',
          role: 'admin',
        })
      ).status,
      400,
    );
  });

  it('documents isValid as email verification, not as a disabled flag', () => {
    const description = (doc.components.schemas.User.properties.isValid as any)
      .description as string;
    assert.match(description, /one-time code|verified|proven/i);
    assert.doesNotMatch(description, /disabled/i);
  });
});

describe('swagger is actually served', () => {
  it('GET /openapi.json returns the document', async () => {
    const res = await t.client().call('GET', '/openapi.json');
    assert.equal(res.status, 200);
    assert.equal(res.json.openapi, '3.0.3');
    assert.ok(res.json.paths['/auth/register/verify']);
  });

  it('GET /docs/ returns the Swagger UI page', async () => {
    const res = await t.client().call('GET', '/docs/');
    assert.equal(res.status, 200);
    assert.match(res.text, /swagger-ui/i);
  });
});
