import {z} from "zod";

export const testerOutputSchema = z.array(z.object({
    id: z.string(),
    passed: z.boolean(),
    explanation: z.string(),
}))