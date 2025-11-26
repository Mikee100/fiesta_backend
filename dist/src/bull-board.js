"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBullBoard = setupBullBoard;
const bull_1 = require("@nestjs/bull");
function setupBullBoard(app) {
    const { BullAdapter, setQueues, router } = require('bull-board');
    const aiQueue = app.get((0, bull_1.getQueueToken)('aiQueue'));
    setQueues([new BullAdapter(aiQueue)]);
    const httpAdapter = app.getHttpAdapter && app.getHttpAdapter();
    const expressApp = httpAdapter?.getInstance ? httpAdapter.getInstance() : app;
    expressApp.use('/admin/queues', router);
}
//# sourceMappingURL=bull-board.js.map