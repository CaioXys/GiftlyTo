-- CreateTable
CREATE TABLE "contributors" (
    "id" SERIAL NOT NULL,
    "contribution_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "contributors_pkey" PRIMARY KEY ("id")
);

-- Migrate existing names array into contributors rows
INSERT INTO "contributors" ("contribution_id", "name")
SELECT "id", unnest("names")
FROM "contributions"
WHERE "names" IS NOT NULL;

-- AlterTable
ALTER TABLE "contributions" DROP COLUMN "names";

-- AddForeignKey
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;