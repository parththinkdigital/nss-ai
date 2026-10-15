import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const indexPath = path.join(process.cwd(), 'data', 'nss_index.json');
    let totalChunks = 0;
    let indexDate = null;

    if (fs.existsSync(indexPath)) {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      totalChunks = data.totalChunks || (data.chunks ? data.chunks.length : 0);
      indexDate = data.createdAt;
    }

    return NextResponse.json({
      status: 'ready',
      totalChunks,
      indexDate,
      hasApiKey: Boolean(process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY !== 'YOUR_NVIDIA_API_KEY_HERE'),
      model: process.env.NVIDIA_MODEL || 'meta/muse-glimmer-30b',
      endpoint: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err.message },
      { status: 500 }
    );
  }
}
