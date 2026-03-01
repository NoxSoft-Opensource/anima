type StateDirEnvSnapshot = {
  animaStateDir: string | undefined;
  animaStateDir: string | undefined;
};

export function snapshotStateDirEnv(): StateDirEnvSnapshot {
  return {
    animaStateDir: process.env.ANIMA_STATE_DIR,
    animaStateDir: process.env.ANIMA_STATE_DIR,
  };
}

export function restoreStateDirEnv(snapshot: StateDirEnvSnapshot): void {
  if (snapshot.animaStateDir === undefined) {
    delete process.env.ANIMA_STATE_DIR;
  } else {
    process.env.ANIMA_STATE_DIR = snapshot.animaStateDir;
  }
  if (snapshot.animaStateDir === undefined) {
    delete process.env.ANIMA_STATE_DIR;
  } else {
    process.env.ANIMA_STATE_DIR = snapshot.animaStateDir;
  }
}

export function setStateDirEnv(stateDir: string): void {
  process.env.ANIMA_STATE_DIR = stateDir;
  delete process.env.ANIMA_STATE_DIR;
}
