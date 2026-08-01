import Tag from '../models/Tag.js';
import Question from '../models/Question.js';
import { createAppError } from '../utils/createAppError.js';
import { getAnswerCountsByQuestionIds } from '../utils/getAnswerCountsByQuestionIds.js';

const getQuestionCountsByTagIds = async (tagIds) => {
    if (tagIds.length === 0) {
        return new Map();
    }

    const counts = await Question.aggregate([
        {
            $match: {
                tags: { $in: tagIds },
            },
        },
        { $unwind: '$tags' },
        {
            $match: {
                tags: { $in: tagIds },
            },
        },
        {
            $group: {
                _id: '$tags',
                questionCount: { $sum: 1 },
            },
        },
    ]);

    return new Map(
        counts.map(({ _id, questionCount }) => [_id.toString(), questionCount])
    );
};

export const getAllTagsService = async () => {
    const tags = await Tag.find({}).lean();
    const questionCounts = await getQuestionCountsByTagIds(tags.map(({ _id }) => _id));

    return tags.map((tag) => ({
        ...tag,
        questionCount: questionCounts.get(tag._id.toString()) ?? 0,
    }));
};

export const getQuestionsByTagService = async (tagId) => {
    const tag = await Tag.findById(tagId);
    if (!tag) {
        throw createAppError('Tag not found', 404);
    }

    const questions = await Question.find({ tags: tagId })
        .populate({ path: 'author', select: 'name' })
        .populate('tags')
        .sort({ createdAt: -1 })
        .lean();

    const answerCounts = await getAnswerCountsByQuestionIds(questions.map(({ _id }) => _id));

    return questions.map((question) => ({
        ...question,
        answerCount: answerCounts.get(question._id.toString()) ?? 0,
    }));
};
