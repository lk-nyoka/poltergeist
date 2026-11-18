export { main, realDeps, type Io } from './cli';
export { parseHauntArgs, UsageError, GHOST_IDS, type HauntOptions, type GhostId } from './args';
export {
  haunt,
  investigate,
  GHOSTS,
  EXIT,
  toFindings,
  type Ghost,
  type GhostContext,
  type HauntDeps,
  type HauntReport,
  type HauntResult,
  type InvestigatedFinding,
  type Investigation,
  type InvestigationInput,
  type LaunchRequest,
  type Launched,
} from './haunt';
export { renderCertificate, generatePlaywrightTest, type VerifiedFinding } from './certificate';
export { SEVERITY, type Severity } from './severity';
