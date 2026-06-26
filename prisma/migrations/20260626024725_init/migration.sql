-- CreateTable
CREATE TABLE "party" (
    "id" SERIAL NOT NULL,
    "honoree_name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "party_date" DATE NOT NULL,
    "message" TEXT,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gifts" (
    "id" SERIAL NOT NULL,
    "party_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "store_link" TEXT NOT NULL DEFAULT '',
    "suggested_value" DECIMAL(10,2),

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" SERIAL NOT NULL,
    "gift_id" INTEGER NOT NULL,
    "contributor_name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "gifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
