import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import Question from '../../src/models/Question.js';
import Answer from '../../src/models/Answer.js';
import User from '../../src/models/User.js';
import Tag from '../../src/models/Tag.js';

const request = supertest(app);

let ownerToken;
let otherToken;

// ─── Auth setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
    await Promise.all([
        User.deleteMany({}),
        Question.deleteMany({}),
        Answer.deleteMany({}),
        Tag.deleteMany({}),
    ]);

    await request.post('/api/auth/register').send({
        name: 'Owner',
        email: 'owner@test.com',
        password: 'Password123#',
    });
    const ownerLogin = await request
        .post('/api/auth/login')
        .send({ email: 'owner@test.com', password: 'Password123#' });
    ownerToken = ownerLogin.body.data.token;

    await request.post('/api/auth/register').send({
        name: 'Other',
        email: 'other@test.com',
        password: 'Password123#',
    });
    const otherLogin = await request
        .post('/api/auth/login')
        .send({ email: 'other@test.com', password: 'Password123#' });
    otherToken = otherLogin.body.data.token;
});

afterEach(async () => {
    await Promise.all([
        Question.deleteMany({}),
        Answer.deleteMany({}),
        Tag.deleteMany({}),
    ]);
});

afterAll(async () => {
    await User.deleteMany({});
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createQuestion(token, overrides = {}) {
    const res = await request
        .post('/api/questions')
        .set('Authorization', `Bearer ${token}`)
        .send({
            title: 'Test Question',
            description: 'A detailed description for the test question.',
            tags: 'javascript,nodejs',
            ...overrides,
        });
    return res.body.data;
}

async function createAnswer(token, questionId, overrides = {}) {
    const res = await request
        .post(`/api/questions/${questionId}/answers`)
        .set('Authorization', `Bearer ${token}`)
        .send({ answerText: 'This is a test answer.', ...overrides });
    return res.body.data;
}

// ─── GET /api/questions ───────────────────────────────────────────────────────

describe('GET /api/questions', () => {
    it('returns 200 with a questions array when questions exist', async () => {
        await createQuestion(ownerToken);
        const res = await request.get('/api/questions');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('attaches answerCount to every question', async () => {
        await createQuestion(ownerToken);
        const res = await request.get('/api/questions');
        expect(res.body.data[0]).toHaveProperty('answerCount');
    });

    it('populates author name and tag names', async () => {
        await createQuestion(ownerToken);
        const res = await request.get('/api/questions');
        const q = res.body.data[0];
        expect(q.author).toHaveProperty('name');
        expect(Array.isArray(q.tags)).toBe(true);
        expect(q.tags[0]).toHaveProperty('name');
    });

    it('returns 404 when no questions exist', async () => {
        const res = await request.get('/api/questions');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

// ─── GET /api/questions/:id ───────────────────────────────────────────────────

describe('GET /api/questions/:id', () => {
    it('returns 200 with the question and an answers array', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request.get(`/api/questions/${q._id}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data._id).toBe(q._id);
        expect(Array.isArray(res.body.data.answers)).toBe(true);
    });

    it('increments views on each fetch', async () => {
        const q = await createQuestion(ownerToken);
        await request.get(`/api/questions/${q._id}`);
        const res = await request.get(`/api/questions/${q._id}`);
        expect(res.body.data.views).toBeGreaterThanOrEqual(2);
    });

    it('includes existing answers in the response', async () => {
        const q = await createQuestion(ownerToken);
        await createAnswer(otherToken, q._id);
        const res = await request.get(`/api/questions/${q._id}`);
        expect(res.body.data.answers.length).toBe(1);
    });

    it('returns 404 for a non-existent question ID', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request.get(`/api/questions/${fakeId}`);
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

// ─── POST /api/questions ──────────────────────────────────────────────────────

describe('POST /api/questions', () => {
    it('creates a question and returns 201', async () => {
        const res = await request
            .post('/api/questions')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ title: 'New Q', description: 'Some description.', tags: 'react' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('_id');
        expect(res.body.data.title).toBe('New Q');
    });

    it('creates and resolves comma-separated tags', async () => {
        const res = await request
            .post('/api/questions')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ title: 'Tagged Q', description: 'Desc.', tags: 'python,django' });
        expect(res.status).toBe(201);
        expect(res.body.data.tags).toHaveLength(2);
    });

    it('returns 401 when no token is provided', async () => {
        const res = await request
            .post('/api/questions')
            .send({ title: 'Unauth', description: 'Desc.', tags: 'node' });
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });
});

// ─── PUT /api/questions/:id ───────────────────────────────────────────────────

describe('PUT /api/questions/:id', () => {
    it('allows the owner to update their question', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .put(`/api/questions/${q._id}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ title: 'Updated Title', description: 'Updated desc.', tags: 'updated' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.title).toBe('Updated Title');
    });

    it('returns 403 when a non-owner tries to update', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .put(`/api/questions/${q._id}`)
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ title: 'Hacked', description: 'Hacked.', tags: 'hack' });
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('returns 404 for a non-existent question', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request
            .put(`/api/questions/${fakeId}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ title: 'X', description: 'X', tags: 'x' });
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    it('returns 401 when no token is provided', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .put(`/api/questions/${q._id}`)
            .send({ title: 'X', description: 'X', tags: 'x' });
        expect(res.status).toBe(401);
    });
});

// ─── DELETE /api/questions/:id ────────────────────────────────────────────────

describe('DELETE /api/questions/:id', () => {
    it('allows the owner to delete their question', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .delete(`/api/questions/${q._id}`)
            .set('Authorization', `Bearer ${ownerToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('also deletes associated answers when question is deleted', async () => {
        const q = await createQuestion(ownerToken);
        await createAnswer(otherToken, q._id);
        await request
            .delete(`/api/questions/${q._id}`)
            .set('Authorization', `Bearer ${ownerToken}`);
        const count = await Answer.countDocuments({ questionId: q._id });
        expect(count).toBe(0);
    });

    it('returns 403 when a non-owner tries to delete', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .delete(`/api/questions/${q._id}`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('returns 404 for a non-existent question', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request
            .delete(`/api/questions/${fakeId}`)
            .set('Authorization', `Bearer ${ownerToken}`);
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

// ─── POST /api/questions/:id/upvote ──────────────────────────────────────────

describe('POST /api/questions/:id/upvote', () => {
    it('upvotes a question and returns updated voteCount', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .post(`/api/questions/${q._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.voteCount).toBeGreaterThanOrEqual(1);
    });

    it('does not double-upvote if the user already upvoted', async () => {
        const q = await createQuestion(ownerToken);
        await request
            .post(`/api/questions/${q._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        const res = await request
            .post(`/api/questions/${q._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.voteCount).toBe(1);
    });

    it('returns 401 when no token is provided', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request.post(`/api/questions/${q._id}/upvote`);
        expect(res.status).toBe(401);
    });
});

// ─── POST /api/questions/:id/downvote ────────────────────────────────────────

describe('POST /api/questions/:id/downvote', () => {
    it('downvotes a question and returns updated voteCount', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .post(`/api/questions/${q._id}/downvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.voteCount).toBeLessThanOrEqual(-1);
    });

    it('switches from upvote to downvote', async () => {
        const q = await createQuestion(ownerToken);
        await request
            .post(`/api/questions/${q._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        const res = await request
            .post(`/api/questions/${q._id}/downvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.voteCount).toBe(-1);
    });

    it('returns 401 when no token is provided', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request.post(`/api/questions/${q._id}/downvote`);
        expect(res.status).toBe(401);
    });
});

// ─── GET /api/questions/:questionId/answers ───────────────────────────────────

describe('GET /api/questions/:questionId/answers', () => {
    it('returns 200 with answers when answers exist', async () => {
        const q = await createQuestion(ownerToken);
        await createAnswer(otherToken, q._id);
        const res = await request.get(`/api/questions/${q._id}/answers`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('populates author name in each answer', async () => {
        const q = await createQuestion(ownerToken);
        await createAnswer(otherToken, q._id);
        const res = await request.get(`/api/questions/${q._id}/answers`);
        expect(res.body.data[0].author).toHaveProperty('name');
    });

    it('returns 404 when the question has no answers', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request.get(`/api/questions/${q._id}/answers`);
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

// ─── POST /api/questions/:questionId/answers ──────────────────────────────────

describe('POST /api/questions/:questionId/answers', () => {
    it('creates an answer and returns 201', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .post(`/api/questions/${q._id}/answers`)
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ answerText: 'My answer text.' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('_id');
        expect(res.body.data.answerText).toBe('My answer text.');
    });

    it('populates author name in the created answer', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .post(`/api/questions/${q._id}/answers`)
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ answerText: 'Answer with author.' });
        expect(res.body.data.author).toHaveProperty('name');
    });

    it('returns 401 when no token is provided', async () => {
        const q = await createQuestion(ownerToken);
        const res = await request
            .post(`/api/questions/${q._id}/answers`)
            .send({ answerText: 'Unauthorized answer.' });
        expect(res.status).toBe(401);
    });
});

// ─── PUT /api/answers/:answerId ───────────────────────────────────────────────

describe('PUT /api/answers/:answerId', () => {
    it('allows the owner to update their answer', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request
            .put(`/api/answers/${a._id}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ answerText: 'Updated answer text.' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.answerText).toBe('Updated answer text.');
    });

    it('returns 403 when a non-owner tries to update', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request
            .put(`/api/answers/${a._id}`)
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ answerText: 'Unauthorized update.' });
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('returns 404 for a non-existent answer', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request
            .put(`/api/answers/${fakeId}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ answerText: 'Ghost answer.' });
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

// ─── DELETE /api/answers/:answerId ────────────────────────────────────────────

describe('DELETE /api/answers/:answerId', () => {
    it('allows the owner to delete their answer', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request
            .delete(`/api/answers/${a._id}`)
            .set('Authorization', `Bearer ${ownerToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeUndefined();
    });

    it('returns 403 when a non-owner tries to delete', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request
            .delete(`/api/answers/${a._id}`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('returns 404 for a non-existent answer', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request
            .delete(`/api/answers/${fakeId}`)
            .set('Authorization', `Bearer ${ownerToken}`);
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

// ─── POST /api/answers/:answerId/upvote ───────────────────────────────────────

describe('POST /api/answers/:answerId/upvote', () => {
    it('upvotes an answer and returns updated document', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request
            .post(`/api/answers/${a._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.voteCount).toBeGreaterThanOrEqual(1);
    });

    it('does not double-upvote if the user already upvoted', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        await request
            .post(`/api/answers/${a._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        const res = await request
            .post(`/api/answers/${a._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.voteCount).toBe(1);
    });

    it('returns 401 when no token is provided', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request.post(`/api/answers/${a._id}/upvote`);
        expect(res.status).toBe(401);
    });
});

// ─── POST /api/answers/:answerId/downvote ─────────────────────────────────────

describe('POST /api/answers/:answerId/downvote', () => {
    it('downvotes an answer and returns updated document', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request
            .post(`/api/answers/${a._id}/downvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.voteCount).toBeLessThanOrEqual(-1);
    });

    it('switches from upvote to downvote', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        await request
            .post(`/api/answers/${a._id}/upvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        const res = await request
            .post(`/api/answers/${a._id}/downvote`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.voteCount).toBe(-1);
    });

    it('returns 401 when no token is provided', async () => {
        const q = await createQuestion(ownerToken);
        const a = await createAnswer(ownerToken, q._id);
        const res = await request.post(`/api/answers/${a._id}/downvote`);
        expect(res.status).toBe(401);
    });
});
