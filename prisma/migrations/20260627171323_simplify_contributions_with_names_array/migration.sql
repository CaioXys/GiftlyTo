/*
  Warnings:

  - You are about to drop the column `amount` on the `contributions` table. All the data in the column will be lost.
  - You are about to drop the column `contributor_name` on the `contributions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "contributions" DROP COLUMN "amount",
DROP COLUMN "contributor_name",
ADD COLUMN     "message" TEXT,
ADD COLUMN     "names" TEXT[],
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pendente';

-- AlterTable
ALTER TABLE "gifts" ADD COLUMN     "pix_link" TEXT NOT NULL DEFAULT '';
