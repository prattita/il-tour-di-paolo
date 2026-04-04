/**
 * Firestore security rules for Feed v2 (feed posts, likes, comments).
 *
 * Run: `npm run test:rules`
 * Requires: **Java** (JRE/JDK 11+) on PATH — the Firestore emulator is a Java process.
 * If `java -version` fails, install a JDK and retry.
 *
 * The script uses `firebase emulators:exec` so the emulator host/port are set automatically;
 * do not run this file with plain `vitest run` unless you already have the emulator up and
 * `FIRESTORE_EMULATOR_HOST` set.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = join(__dirname, '..', 'firestore.rules')

const PROJECT_ID = 'demo-il-tour'
const GROUP_ID = 'group_test_1'
const OWNER_UID = 'owner_uid_1'
const MEMBER_UID = 'member_uid_1'
const MEMBER2_UID = 'member_uid_2'
const STRANGER_UID = 'stranger_uid'

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
    },
  })
})

afterAll(async () => {
  if (testEnv) await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'groups', GROUP_ID), {
      ownerId: OWNER_UID,
      memberIds: [OWNER_UID, MEMBER_UID, MEMBER2_UID],
    })

    await setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1'), {
      userId: MEMBER_UID,
      type: 'task_completion',
      displayName: 'Member One',
      timestamp: Timestamp.fromMillis(1_700_000_000_000),
      activityId: 'act1',
      activityName: 'Activity',
      taskId: 't1',
      taskName: 'Task',
      medal: 'gold',
      imageUrl: 'https://example.com/p.jpg',
      description: null,
      likes: [],
      commentCount: 0,
    })
  })
})

function authedDb(uid) {
  return testEnv.authenticatedContext(uid).firestore()
}

describe('groups/{groupId}/feed — read', () => {
  it('member can read a feed post', async () => {
    const db = authedDb(MEMBER_UID)
    await assertSucceeds(getDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1')))
  })

  it('non-member cannot read feed', async () => {
    const db = authedDb(STRANGER_UID)
    await assertFails(getDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1')))
  })

  it('unauthenticated cannot read feed', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1')))
  })
})

describe('groups/{groupId}/feed — create / delete', () => {
  it('member cannot create a feed post', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(
      setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'new_post'), {
        userId: MEMBER_UID,
        type: 'task_completion',
        timestamp: Timestamp.now(),
      }),
    )
  })

  it('owner can create a feed post', async () => {
    const db = authedDb(OWNER_UID)
    await assertSucceeds(
      setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'owner_post'), {
        userId: MEMBER_UID,
        type: 'task_completion',
        displayName: 'X',
        timestamp: Timestamp.now(),
        activityId: 'a',
        activityName: 'A',
        taskId: 't',
        taskName: 'T',
        medal: 'bronze',
        imageUrl: null,
        description: null,
      }),
    )
  })

  it('member cannot delete a feed post', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(deleteDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1')))
  })

  it('owner can delete a feed post', async () => {
    const db = authedDb(OWNER_UID)
    await assertSucceeds(deleteDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1')))
  })
})

describe('groups/{groupId}/feed — likes (member update)', () => {
  it('member can update only likes', async () => {
    const db = authedDb(MEMBER_UID)
    await assertSucceeds(
      updateDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1'), {
        likes: [MEMBER_UID],
      }),
    )
  })

  it('member cannot change displayName on a post', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(
      updateDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1'), {
        displayName: 'Hacked',
      }),
    )
  })

  it('owner can update any fields on a post', async () => {
    const db = authedDb(OWNER_UID)
    await assertSucceeds(
      updateDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1'), {
        description: 'Updated by owner',
      }),
    )
  })
})

describe('groups/{groupId}/feed — commentCount (member update)', () => {
  it('member can update only commentCount', async () => {
    const db = authedDb(MEMBER_UID)
    await assertSucceeds(
      updateDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1'), {
        commentCount: 1,
      }),
    )
  })

  it('member cannot set commentCount negative', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(
      updateDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1'), {
        commentCount: -1,
      }),
    )
  })

  it('member cannot update commentCount and likes together', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(
      updateDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1'), {
        commentCount: 1,
        likes: [MEMBER_UID],
      }),
    )
  })
})

describe('groups/{groupId}/feed/{postId}/comments', () => {
  const commentPayload = (uid, text) => ({
    userId: uid,
    displayName: 'Commenter',
    avatarUrl: null,
    text,
    createdAt: Timestamp.now(),
  })

  it('member can create a comment on a post', async () => {
    const db = authedDb(MEMBER_UID)
    await assertSucceeds(
      setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c1'), commentPayload(MEMBER_UID, 'Nice!')),
    )
  })

  it('create fails if userId does not match auth', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(
      setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_bad'), commentPayload(MEMBER2_UID, 'Impersonation')),
    )
  })

  it('create fails if text is empty', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(
      setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_empty'), {
        ...commentPayload(MEMBER_UID, ''),
      }),
    )
  })

  it('create fails if text exceeds 500 chars', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(
      setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_long'), commentPayload(MEMBER_UID, 'x'.repeat(501))),
    )
  })

  it('non-member cannot create a comment', async () => {
    const db = authedDb(STRANGER_UID)
    await assertFails(
      setDoc(doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c2'), commentPayload(STRANGER_UID, 'Hi')),
    )
  })

  it('author can delete own comment; other member cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(
        doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_del'),
        commentPayload(MEMBER_UID, 'Delete me'),
      )
    })

    await assertSucceeds(
      deleteDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_del')),
    )

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(
        doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_del2'),
        commentPayload(MEMBER_UID, 'Not yours'),
      )
    })

    await assertFails(
      deleteDoc(doc(authedDb(MEMBER2_UID), 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_del2')),
    )
  })

  it('owner can delete any comment', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(
        doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_owner'),
        commentPayload(MEMBER2_UID, 'Owner removes'),
      )
    })

    await assertSucceeds(
      deleteDoc(doc(authedDb(OWNER_UID), 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_owner')),
    )
  })

  it('comments are not updatable', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(
        doc(db, 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_imm'),
        commentPayload(MEMBER_UID, 'Original'),
      )
    })

    await assertFails(
      updateDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'feed', 'post1', 'comments', 'c_imm'), {
        text: 'Edited',
      }),
    )
  })
})

describe('groups/{groupId}/activities and enrollments — advanced', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'groups', GROUP_ID, 'activities', 'act_std'), {
        name: 'Standard',
        sortOrder: 0,
        isAdvanced: false,
        prerequisiteActivityId: null,
      })
      await setDoc(doc(db, 'groups', GROUP_ID, 'activities', 'act_adv'), {
        name: 'Advanced',
        sortOrder: 1,
        isAdvanced: true,
        prerequisiteActivityId: 'act_std',
      })
    })
  })

  it('member can read standard activity', async () => {
    await assertSucceeds(
      getDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'activities', 'act_std')),
    )
  })

  it('member cannot read advanced without enrollment', async () => {
    await assertFails(
      getDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'activities', 'act_adv')),
    )
  })

  it('member can read advanced when enrolled', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'groups', GROUP_ID, 'enrollments', MEMBER_UID), {
        userId: MEMBER_UID,
        enrolledActivityIds: ['act_adv'],
        updatedAt: Timestamp.fromMillis(1),
      })
    })
    await assertSucceeds(
      getDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'activities', 'act_adv')),
    )
  })

  it('owner can always read advanced activity', async () => {
    await assertSucceeds(
      getDoc(doc(authedDb(OWNER_UID), 'groups', GROUP_ID, 'activities', 'act_adv')),
    )
  })

  it('member can read another member enrollment doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'groups', GROUP_ID, 'enrollments', MEMBER2_UID), {
        userId: MEMBER2_UID,
        enrolledActivityIds: [],
        updatedAt: Timestamp.fromMillis(1),
      })
    })
    await assertSucceeds(
      getDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'enrollments', MEMBER2_UID)),
    )
  })

  it('non-member cannot read enrollment', async () => {
    await assertFails(
      getDoc(doc(authedDb(STRANGER_UID), 'groups', GROUP_ID, 'enrollments', MEMBER_UID)),
    )
  })

  it('member cannot write enrollment', async () => {
    await assertFails(
      setDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'enrollments', MEMBER_UID), {
        userId: MEMBER_UID,
        enrolledActivityIds: ['act_adv'],
        updatedAt: Timestamp.fromMillis(1),
      }),
    )
  })

  it('owner can create enrollment doc', async () => {
    await assertSucceeds(
      setDoc(doc(authedDb(OWNER_UID), 'groups', GROUP_ID, 'enrollments', MEMBER_UID), {
        userId: MEMBER_UID,
        enrolledActivityIds: ['act_adv'],
        updatedAt: Timestamp.fromMillis(1),
      }),
    )
  })
})

describe('groups/{groupId}/activities — personal', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'groups', GROUP_ID, 'activities', 'act_pers'), {
        name: 'Personal',
        sortOrder: 0,
        isAdvanced: false,
        prerequisiteActivityId: null,
        isPersonal: true,
        assignedUserId: MEMBER_UID,
      })
      await setDoc(doc(db, 'groups', GROUP_ID, 'activities', 'act_pers_un'), {
        name: 'Personal unassigned',
        sortOrder: 1,
        isAdvanced: false,
        prerequisiteActivityId: null,
        isPersonal: true,
        assignedUserId: null,
      })
    })
  })

  it('any group member can read assigned personal activity', async () => {
    await assertSucceeds(
      getDoc(doc(authedDb(MEMBER2_UID), 'groups', GROUP_ID, 'activities', 'act_pers')),
    )
  })

  it('member cannot read unassigned personal activity', async () => {
    await assertFails(
      getDoc(doc(authedDb(MEMBER_UID), 'groups', GROUP_ID, 'activities', 'act_pers_un')),
    )
  })

  it('owner can read unassigned personal activity', async () => {
    await assertSucceeds(
      getDoc(doc(authedDb(OWNER_UID), 'groups', GROUP_ID, 'activities', 'act_pers_un')),
    )
  })
})
