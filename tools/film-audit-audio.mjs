// Parse the Summary block that ffmpeg's ebur128 filter prints at the end of a run. The per-frame
// lines above it carry running values that are NOT the final answer, so read only the summary.
const lastNumber = (text, pattern) => {
	const matches = [...text.matchAll(pattern)];
	return matches.length ? Number(matches.at(-1)[1]) : NaN;
};

export const parseEbur128Summary = (output) => {
	const text = String(output ?? '');
	const summaryAt = text.lastIndexOf('Summary:');
	const summary = summaryAt === -1 ? '' : text.slice(summaryAt);

	return {
		integratedLoudness: lastNumber(summary, /I:\s*(-?[0-9.]+)\s*LUFS/g),
		loudnessRange: lastNumber(summary, /LRA:\s*(-?[0-9.]+)\s*LU/g),
		truePeak: lastNumber(summary, /Peak:\s*(-?[0-9.]+)\s*dBFS/g),
	};
};
