/**
 * Security test specification for JARVIS Firestore rules.
 * Designed for verification against @firebase/rules-unit-testing when emulator is running.
 */
export const DIRTY_DOZEN_CASES = [
  { name: 'unauthenticated_task_create', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'unverified_email_create', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'cross_tenant_task_read', path: 'users/uid2/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'identity_spoof_userId', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'shadow_field_injection', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'forged_client_timestamp', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'immutable_createdAt_update', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'oversized_title_poisoning', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'unbounded_steps_array', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'invalid_category_enum', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'type_poisoned_completed', path: 'users/uid1/tasks/t1', expected: 'PERMISSION_DENIED' },
  { name: 'unprotected_root_collection', path: 'admin/secrets', expected: 'PERMISSION_DENIED' },
] as const;
