import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenRouterEmbeddingProvider } from "@law/knowledge";
import { LegalKnowledgeController } from "./legal-knowledge.controller";
import {
  LEGAL_EMBEDDING_PROVIDER,
  LegalKnowledgeService,
} from "./legal-knowledge.service";
import { LegalKnowledgeIngestionService } from "./legal-knowledge.ingestion";

@Module({
  controllers: [LegalKnowledgeController],
  providers: [
    {
      provide: LEGAL_EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new OpenRouterEmbeddingProvider({
          apiKey: config.get<string>("OPENROUTER_API_KEY", ""),
          baseUrl: config.get<string>(
            "OPENROUTER_BASE_URL",
            "https://openrouter.ai/api/v1",
          ),
          model: config.get<string>("LEGAL_EMBEDDING_MODEL", "BAAI/bge-m3"),
        }),
    },
    LegalKnowledgeService,
    LegalKnowledgeIngestionService,
  ],
})
export class LegalKnowledgeModule {}
