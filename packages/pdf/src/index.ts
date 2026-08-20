#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { readHandler, readInputSchema, readOutputSchema } from './tools/read.js';
import { infoHandler, infoInputSchema, infoOutputSchema } from './tools/info.js';

const server = new McpServer({ name: 'pdf', version: '1.0.0' });

server.registerTool(
  'pdf.read',
  {
    description:
      'Extract text (and optionally structured per-item positions) from a local PDF, over an optional page range, with per-call size caps.',
    inputSchema: readInputSchema,
    outputSchema: readOutputSchema,
  },
  readHandler,
);

server.registerTool(
  'pdf.info',
  {
    description:
      'Return page count, encryption status, permission flags, and standard document metadata for a local PDF.',
    inputSchema: infoInputSchema,
    outputSchema: infoOutputSchema,
  },
  infoHandler,
);

const transport = new StdioServerTransport();
await server.connect(transport);
