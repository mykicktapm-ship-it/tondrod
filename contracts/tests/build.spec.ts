import fs from 'fs';
import path from 'path';

/**
 * Build artefact existence check
 *
 * The Tact compiler emits TypeScript contract wrappers into the
 * `contracts/build` directory.  If these files are missing it
 * usually means the contracts were not compiled before running the
 * test suite.  This test fails fast to alert the developer to run
 * `pnpm build` (automatically invoked by the `test` script).
 */
describe('build artefacts', () => {
  test('compiled contracts exist', () => {
    const buildDir = path.resolve(__dirname, '..', 'build');
    const tactDir = path.resolve(__dirname, '..', 'tact');
    // Required artefacts (always expected)
    const artefacts = ['TonRodyLobby', 'TonRodyFactory'];
    // Optional artefacts: check for the source contract before requiring output
    const optional = ['TonRodyCoinFlip'];
    for (const name of optional) {
      const tactFile = path.join(tactDir, `${name}.tact`);
      if (fs.existsSync(tactFile)) {
        artefacts.push(name);
      }
    }
    for (const name of artefacts) {
      const fileTs = path.join(buildDir, `${name}.ts`);
      if (!fs.existsSync(fileTs)) {
        throw new Error(`Missing build artefact: ${fileTs}. Run 'pnpm build' first.`);
      }
    }
  });
});
