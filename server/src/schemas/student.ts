import { z } from "zod";

export const updateStudentNameSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
});
