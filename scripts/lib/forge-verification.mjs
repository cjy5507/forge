import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const VERIFICATION_ARTIFACT_PATH = ['.forge', 'evidence', 'verification-latest.json'];

export function getVerificationArtifactPath(cwd = '.') {
  return join(cwd, ...VERIFICATION_ARTIFACT_PATH);
}

export function readVerificationArtifact(cwd = '.') {
  const artifactPath = getVerificationArtifactPath(cwd);
  if (!existsSync(artifactPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(artifactPath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeVerificationArtifact(cwd = '.', verification = {}) {
  const artifactPath = getVerificationArtifactPath(cwd);
  mkdirSync(join(cwd, '.forge', 'evidence'), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
  return artifactPath;
}
