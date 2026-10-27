import narration from './data/narration.json';
import {type NarrationWord, toFrame, wordAt} from '../../engine/narration';
import {END, FPS} from './beatmap';

// Every picture moment, from the voice. If narration.txt changes and a word below is gone, wordAt
// throws at render time rather than letting a cut drift.
const W = narration.words as NarrationWord[];
const start = (text: string, nth = 0) => toFrame(wordAt(W, text, nth).start, FPS);
const end = (text: string, nth = 0) => toFrame(wordAt(W, text, nth).end, FPS);

export const MOMENT = {
	draw: start('sea'), // the tide line draws itself across the day
	drawn: end('time'),
	ride: start('Twice'), // the marker rides the tide towards the afternoon
	stops: start('stops'), // and stops dead at high water: slack
	when: start('when'), // the turning points get their times, one by one
	minute: start('minute'),
	every: start('every'), // other harbours' tides appear behind
	slack: start('Slack'),
	time: start('14:52'), // the time becomes the hero
	go: start('Go'), // the end card
	close: toFrame(wordAt(W, 'rests').end + END.close, FPS), // the music takes the room
};
