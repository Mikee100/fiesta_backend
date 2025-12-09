"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const seeding_service_1 = require("../src/modules/seeding/seeding.service");
const common_1 = require("@nestjs/common");
async function bootstrap() {
    const logger = new common_1.Logger('SeedKnowledge');
    try {
        const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
        const seedingService = app.get(seeding_service_1.SeedingService);
        logger.log('Starting knowledge base seeding...');
        await seedingService.seedKnowledgeBase();
        logger.log('Knowledge base seeding completed successfully!');
        await app.close();
        process.exit(0);
    }
    catch (error) {
        logger.error('Failed to seed knowledge base', error);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=seed-knowledge.js.map