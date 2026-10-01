import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { RegisterRequestSchema } from "@card-table/shared";
import { DATABASE_FILE, requireAuthPepper } from "../config/env.js";
import { openDatabase } from "../db/connection.js";
import { hashPassword } from "./passwords.js";
import { UserRepository } from "./users.js";

const prompt = createInterface({ input: stdin, output: stdout });
try {
  const username = process.argv[2] ?? await prompt.question("Username: ");
  const displayName = process.argv[3] ?? await prompt.question("Display name: ");
  const password = process.env.USER_CREATE_PASSWORD ?? await prompt.question("Password: ");
  const parsed = RegisterRequestSchema.omit({ signupCode: true }).safeParse({ username, displayName, password });
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));

  const database = openDatabase(DATABASE_FILE);
  try {
    const digest = await hashPassword(parsed.data.password, requireAuthPepper());
    const user = new UserRepository(database).create({
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash: digest.hash,
      passwordSalt: digest.salt,
    });
    console.log(`Created ${user.username} (${user.displayName}).`);
  } finally {
    database.close();
  }
} finally {
  prompt.close();
}
