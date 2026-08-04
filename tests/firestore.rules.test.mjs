import { after, afterEach, before, describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'ppoms-rules-test';
let testEnv;

async function seedUsers() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'users', 'super@example.com'), {
      email: 'super@example.com',
      role: 'super_admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await setDoc(doc(firestore, 'users', 'admin@example.com'), {
      email: 'admin@example.com',
      role: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
}

function authenticatedFirestore(email) {
  return testEnv.authenticatedContext(`uid-${email}`, { email }).firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe('PPOMS Firestore security rules', () => {
  test('public users can read master data but cannot write it', async () => {
    const firestore = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(firestore, 'materials', 'material-1')));
    await assertSucceeds(getDoc(doc(firestore, 'laborTypes', 'labor-1')));
    await assertFails(setDoc(doc(firestore, 'materials', 'material-1'), { id: 'material-1' }));
  });

  test('unauthorized signed-in users cannot read operational data', async () => {
    const firestore = authenticatedFirestore('pending@example.com');

    await assertFails(getDoc(doc(firestore, 'projects', 'project-1')));
  });

  test('admins can read and write operational data', async () => {
    await seedUsers();
    const firestore = authenticatedFirestore('admin@example.com');
    const projectRef = doc(firestore, 'projects', 'project-1');

    await assertSucceeds(setDoc(projectRef, { id: 'project-1', name: 'Test project' }));
    const snapshot = await assertSucceeds(getDoc(projectRef));
    assert.equal(snapshot.data().name, 'Test project');
  });

  test('admins can read themselves but cannot list or manage user roles', async () => {
    await seedUsers();
    const firestore = authenticatedFirestore('admin@example.com');

    await assertSucceeds(getDoc(doc(firestore, 'users', 'admin@example.com')));
    await assertFails(getDocs(collection(firestore, 'users')));
    await assertFails(setDoc(doc(firestore, 'users', 'new@example.com'), {
      email: 'new@example.com',
      role: 'super_admin',
    }));
    await assertFails(updateDoc(doc(firestore, 'users', 'admin@example.com'), {
      role: 'super_admin',
    }));
  });

  test('users can update only their own profile fields', async () => {
    await seedUsers();
    const firestore = authenticatedFirestore('admin@example.com');
    const userRef = doc(firestore, 'users', 'admin@example.com');

    await assertSucceeds(updateDoc(userRef, {
      uid: 'uid-admin@example.com',
      displayName: 'Admin User',
      photoURL: 'https://example.com/avatar.png',
      lastLogin: '2026-08-04T00:00:00.000Z',
    }));
    await assertFails(updateDoc(userRef, { email: 'other@example.com' }));
  });

  test('super-admins can list and manage other users', async () => {
    await seedUsers();
    const firestore = authenticatedFirestore('super@example.com');
    const newUserRef = doc(firestore, 'users', 'new@example.com');

    await assertSucceeds(getDocs(collection(firestore, 'users')));
    await assertSucceeds(setDoc(newUserRef, {
      email: 'new@example.com',
      role: 'admin',
      createdAt: '2026-08-04T00:00:00.000Z',
    }));
    await assertSucceeds(updateDoc(newUserRef, { role: 'super_admin' }));
    await assertSucceeds(deleteDoc(newUserRef));
  });

  test('super-admins cannot change their own role or delete themselves', async () => {
    await seedUsers();
    const firestore = authenticatedFirestore('super@example.com');
    const selfRef = doc(firestore, 'users', 'super@example.com');

    await assertFails(updateDoc(selfRef, { role: 'admin' }));
    await assertFails(deleteDoc(selfRef));
  });

  test('unknown top-level collections remain denied to admins', async () => {
    await seedUsers();
    const firestore = authenticatedFirestore('admin@example.com');

    await assertFails(setDoc(doc(firestore, 'unexpectedCollection', 'record-1'), {
      id: 'record-1',
    }));
  });
});
