-- CreateTable
CREATE TABLE "session" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "link" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_code_idx" ON "session"("code");

-- AddForeignKey
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
