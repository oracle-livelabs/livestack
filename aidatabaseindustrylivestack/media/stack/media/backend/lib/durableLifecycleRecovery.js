'use strict';

function activeJobIdsFromReconciliation(reconciliation = null) {
  if (reconciliation?.reason !== 'owner_active'
      || !reconciliation.operation?.jobId) {
    return [];
  }
  return [reconciliation.operation.jobId];
}

async function stopHeartbeatBeforeLeaseRelease({
  ownership,
  release,
} = {}) {
  if (!ownership?.stop || typeof release !== 'function') {
    throw new Error('Heartbeat shutdown requires ownership.stop and an exact release callback.');
  }
  let stopError = null;
  try {
    await ownership.stop();
  } catch (error) {
    stopError = error;
  }
  if (!stopError) {
    return release();
  }
  // A heartbeat infrastructure exception does not prove that the durable
  // Oracle lease disappeared. Preserve the exact lease until its bounded
  // expiry so the recurring reconciler can terminalize the owner job first.
  throw stopError;
}

async function runDurableLifecycleRecovery({
  recoverAllStabilizingDatasets,
  reconcileDatasetOperationLock,
  recoverOrphanedDatasetJobs,
  recoverStabilizingDataset,
  cleanupQuarantinedCandidateAssets,
  deliverPendingDatasetEvents,
} = {}) {
  await recoverAllStabilizingDatasets();

  const reconciliation = await reconcileDatasetOperationLock();
  const activeJobIds = activeJobIdsFromReconciliation(reconciliation);
  const recovery = await recoverOrphanedDatasetJobs({ activeJobIds });

  for (const jobId of recovery.stabilizingJobIds || []) {
    await recoverStabilizingDataset(jobId);
  }

  const postRecoveryReconciliation = await reconcileDatasetOperationLock({
    recoveredJobIds: recovery.jobIds || [],
  });
  const cleanup = await cleanupQuarantinedCandidateAssets();
  const outbox = await deliverPendingDatasetEvents();

  return {
    reconciliation,
    activeJobIds,
    recovery,
    postRecoveryReconciliation,
    cleanup,
    outbox,
  };
}

module.exports = {
  activeJobIdsFromReconciliation,
  stopHeartbeatBeforeLeaseRelease,
  runDurableLifecycleRecovery,
};
