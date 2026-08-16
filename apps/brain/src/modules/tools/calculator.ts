import { z } from 'zod';
import { JarvisTool } from './types';

const CalculatorInputSchema = z.object({
  expression: z
    .string()
    .describe('Mathematical expression to calculate, e.g. "1836100 / 12" or "15 * 85000 / 100"'),
});

export const calculatorTool: JarvisTool<z.infer<typeof CalculatorInputSchema>, { result: number; expression: string }> = {
  name: 'calculator',
  description: 'Performs mathematical calculations accurately (addition, subtraction, multiplication, division, percentages).',
  inputSchema: CalculatorInputSchema,
  async execute(input) {
    let expr = input.expression
      .replace(/percent\s+of/gi, '/100*')
      .replace(/%\s*of/gi, '/100*')
      .replace(/%/g, '/100*')
      .replace(/of/gi, '*')
      .replace(/x/gi, '*')
      .replace(/[^0-9+\-*/.() ]/g, '')
      .replace(/(\*|\/|\+|\-)\s*(\*|\/|\+|\-)/g, '$1');

    try {
      // Safe math calculation using Function construction without access to scope
      const sanitize = new Function(`"use strict"; return (${expr});`);
      const val = sanitize();

      if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
        throw new Error('Invalid mathematical evaluation');
      }

      return {
        expression: input.expression,
        result: Math.round(val * 100000) / 100000,
      };
    } catch (err) {
      throw new Error(`Calculation error for "${input.expression}": ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
