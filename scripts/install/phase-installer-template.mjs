import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoIndex = process.argv.indexOf('--repo');
if (repoIndex < 0 || !process.argv[repoIndex + 1]) throw new Error('Usage: node INSTALL_PHASE.mjs --repo <repository-root>');
const repoArg = path.resolve(process.argv[repoIndex + 1]);

// Future phase packages import the framework already committed in the accepted base.
// They must not copy/reimplement staging, hashing, promotion, rollback, or build gates.
const frameworkUrl = pathToFileURL(path.join(repoArg, 'scripts', 'install', 'framework.mjs')).href;
const framework = await import(frameworkUrl);
const packageRoot = here;
const descriptorPath = path.join(packageRoot, 'PHASE_PACKAGE.json');
if (!fs.existsSync(descriptorPath)) throw new Error(`Phase descriptor missing: ${descriptorPath}`);
const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));

await framework.runPhaseInstaller({
  repoRoot: framework.parseRepoArgument(process.argv.slice(2)),
  packageRoot,
  descriptor,
});
