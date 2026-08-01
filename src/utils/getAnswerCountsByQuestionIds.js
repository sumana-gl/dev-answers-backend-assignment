import Answer from '../models/Answer.js';

export const getAnswerCountsByQuestionIds = async (questionIds) => {
    if (questionIds.length === 0) {
        return new Map();
    }

    const counts = await Answer.aggregate([
        {
            $match: {
                questionId: { $in: questionIds },
            },
        },
        {
            $group: {
                _id: '$questionId',
                answerCount: { $sum: 1 },
            },
        },
    ]);

    return new Map(
        counts.map(({ _id, answerCount }) => [_id.toString(), answerCount])
    );
};
