import path from 'path';
import { logger, mockConfig, getMockConfig } from './helpers';
import PercyConfig from '@percy/config';
import migrate from '../src/migrate';

describe('percy config:migrate', () => {
  beforeEach(async () => {
    mockConfig('.percy.yml', 'version: 1\n');
    PercyConfig.addMigration((config, util) => {
      if (config.migrate) util.map('migrate', 'migrated', v => v.replace('old', 'new'));
    });
  });

  afterEach(() => {
    PercyConfig.clearMigrations();
  });

  it('by default, renames the config before writing', async () => {
    await migrate();

    expect(logger.stderr).toEqual([]);
    expect(logger.stdout).toEqual([
      '[percy] Found config file: .percy.yml',
      '[percy] Migrating config file...',
      '[percy] Config file migrated!'
    ]);

    expect(getMockConfig('.percy.old.yml')).toContain('version: 1');
    expect(getMockConfig('.percy.yml')).toContain('version: 2');
  });

  it('prints config with the --dry-run flag', async () => {
    await migrate(['--dry-run']);

    expect(getMockConfig('.percy.yml')).toContain('version: 1');
    expect(logger.stderr).toEqual([]);
    expect(logger.stdout).toEqual([
      '[percy] Found config file: .percy.yml',
      '[percy] Migrating config file...',
      '[percy] Config file migrated!',
      '\nversion: 2'
    ]);
  });

  it('works with rc configs', async () => {
    mockConfig('.percyrc', 'version: 1\n');
    await migrate(['.percyrc']);

    expect(getMockConfig('.percyrc')).toEqual('version: 2\n');
  });

  it('works with package.json configs', async () => {
    let json = o => JSON.stringify(o, null, 2) + '\n';

    let pkg = {
      name: 'some-package',
      version: '0.1.0',
      scripts: {},
      percy: { version: 1 },
      dependencies: {},
      devDependencies: {}
    };

    // this is mocked and reflected in `getMockConfig`
    require('fs').writeFileSync('package.json', json(pkg));

    await migrate(['package.json']);

    expect(getMockConfig('package.json')).toEqual(
      json({ ...pkg, percy: { version: 2 } })
    );
  });

  it('can convert between config types', async () => {
    await migrate(['.percy.yml', '.percy.js']);

    expect(getMockConfig('.percy.js'))
      .toEqual('module.exports = {\n  version: 2\n}\n');
  });

  it('errors when a config cannot be found', async () => {
    await expectAsync(
      migrate([path.join('.config', 'percy.yml')])
    ).toBeRejected();

    expect(logger.stdout).toEqual([]);
    expect(logger.stderr).toEqual([
      '[percy] Error: Config file not found'
    ]);
  });

  it('errors when a config cannot be parsed', async () => {
    let filename = path.join('.config', 'percy.yml');
    mockConfig(filename, () => { throw new Error('test'); });

    await expectAsync(migrate([filename])).toBeRejected();

    expect(logger.stdout).toEqual([]);
    expect(logger.stderr).toEqual([
      '[percy] Error: test'
    ]);
  });

  it('warns when a config is already the latest version', async () => {
    mockConfig('.percy.yml', 'version: 2\n');
    await migrate();

    expect(logger.stdout).toEqual([
      '[percy] Found config file: .percy.yml'
    ]);
    expect(logger.stderr).toEqual([
      '[percy] Config is already the latest version'
    ]);

    expect(getMockConfig('.percy.old.yml')).toBeUndefined();
  });

  it('runs registered migrations on the config', async () => {
    mockConfig('.percy.yml', [
      'version: 1',
      'migrate: old-value'
    ].join('\n'));

    await migrate();

    expect(getMockConfig('.percy.yml')).toEqual([
      'version: 2',
      'migrated: new-value'
    ].join('\n') + '\n');
  });
});
