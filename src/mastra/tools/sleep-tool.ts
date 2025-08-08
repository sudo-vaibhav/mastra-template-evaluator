import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const sleepTool = createTool({
  id: 'sleep',
  description: 'Pause execution for a specified number of seconds. Useful for waiting during testing, allowing processes to complete, or adding delays between operations.',
  inputSchema: z.object({
    seconds: z.number()
      .min(0.1)
      .max(300)
      .describe('Number of seconds to sleep (minimum 0.1, maximum 300 seconds)'),
  }),
  outputSchema: z.object({
    sleptFor: z.number().describe('The actual number of seconds slept'),
    message: z.string().describe('Confirmation message'),
  }),
  execute: async ({ context }) => {
    const { seconds } = context;
    
    // Convert seconds to milliseconds for setTimeout
    const milliseconds = seconds * 1000;
    
    // Create a promise that resolves after the specified time
    await new Promise(resolve => setTimeout(resolve, milliseconds));
    
    return {
      sleptFor: seconds,
      message: `Successfully slept for ${seconds} seconds`,
    };
  },
});
