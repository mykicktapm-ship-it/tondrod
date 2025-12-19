import fs from 'fs';
import path from 'path';

/**
 * Build artefact existence check
 *
 * The Tact compiler emits TypeScript contract wrappers into the
 * `contracts/build` directory.  If these files are missing it
 * usually means the contracts were not compiled before running the
 * test suite.  This test fails fast to alert the developer to run
 * `pnpm run build` (automatically invoked by the `test` script).
 */
describe('build artefacts', () => {
  test('compiled contracts exist', () => {
    const buildDir = path.resolve(__dirname, '..', 'build');
    // List of expected artefact file names (without extension)
    const artefacts = ['TonRodyLobby', 'TonRodyFactory', 'TonRodyCoinFlip'];
    for (const name of artefacts) {
      const fileTs = path.join(buildDir, `${name}.ts`);
      if (!fs.existsSync(fileTs)) {
        throw new Error(`Missing build artefact: ${fileTs}. Run \'pnpm run build\' first.`);
      }
    }
  });
});