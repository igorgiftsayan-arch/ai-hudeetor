import { workerConfigSchema, type WorkerConfig } from '@atlas/backend';

export function loadWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return workerConfigSchema.parse(environment);
}
