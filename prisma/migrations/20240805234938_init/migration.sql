/*
  Warnings:

  - Added the required column `format` to the `playlist` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "playlist" ADD COLUMN     "format" TEXT NOT NULL;
