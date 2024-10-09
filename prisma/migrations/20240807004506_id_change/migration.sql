/*
  Warnings:

  - The primary key for the `playlist` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "playlist" DROP CONSTRAINT "playlist_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "playlist_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "playlist_id_seq";
