CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "metaAppId" TEXT,
    "metaGraphVersion" TEXT,
    "metaAppSecretEncrypted" TEXT,
    "metaVerifyTokenEncrypted" TEXT,
    "metaSendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiChatBaseUrl" TEXT,
    "aiChatModel" TEXT,
    "aiChatApiKeyEncrypted" TEXT,
    "aiEmbeddingBaseUrl" TEXT,
    "aiEmbeddingModel" TEXT,
    "aiEmbeddingApiKeyEncrypted" TEXT,
    "aiEmbeddingDimensions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);
