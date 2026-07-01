/**
 * Architecture gate: the org chart, enforced as code.
 * Each workstream owns exactly one directory; the only shared dependency is
 * the frozen contracts package. dependency-cruiser blocks any commit that
 * violates the boundaries — no session can silently couple to another.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make code untestable and unreadable',
      from: {},
      to: { circular: true },
    },
    {
      name: 'workstreams-are-isolated',
      severity: 'error',
      comment:
        'A workstream may not import from another workstream. Integration happens over HTTP, per the contracts.',
      from: {
        path: '^(services/pricing|services/betting|services/simulator|apps/punter-web|apps/trader-ops|bots)/',
      },
      to: {
        path: '^(services/pricing|services/betting|services/simulator|apps/punter-web|apps/trader-ops|bots)/',
        pathNot: ['^$1'],
      },
    },
    {
      name: 'contracts-are-a-leaf',
      severity: 'error',
      comment: 'The frozen contracts package must never depend on any workstream',
      from: { path: '^contracts/' },
      to: { path: '^(services|apps|bots)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|node_modules)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
