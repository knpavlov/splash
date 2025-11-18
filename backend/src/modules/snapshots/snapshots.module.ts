import { SnapshotsRepository } from './snapshots.repository.js';
import { SnapshotsService } from './snapshots.service.js';
import { SnapshotScheduler } from './snapshotScheduler.js';

const repository = new SnapshotsRepository();
export const snapshotsService = new SnapshotsService(repository);
export const snapshotScheduler = new SnapshotScheduler(snapshotsService);

snapshotsService.attachScheduler(snapshotScheduler);
