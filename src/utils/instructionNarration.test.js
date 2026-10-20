import assert from 'node:assert/strict';
import test from 'node:test';
import {createInstructionNarration} from './instructionNarration.js';

const delay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
const namedError = name => Object.assign(new Error(name), {name});

class FakeAudio extends EventTarget {
    readyState = 4;
    paused = true;
    ended = false;
    duration = 10;
    currentTime = 0;
    error = null;
    playCalls = 0;
    loadCalls = 0;
    failures = [];

    play() {
        this.playCalls += 1;
        const failure = this.failures.shift();
        if (failure) return Promise.reject(failure);
        this.paused = false;
        this.ended = false;
        this.dispatchEvent(new Event('playing'));
        return Promise.resolve();
    }

    pause() {
        this.paused = true;
        this.dispatchEvent(new Event('pause'));
    }

    load() {
        this.loadCalls += 1;
        this.error = null;
        this.currentTime = 0;
    }
}

const fixture = (audio = new FakeAudio()) => {
    const changes = [];
    const player = createInstructionNarration({
        audio, revealThresholds: [0, 0.2, 0.5, 0.8, 0.95], onChange: state => changes.push(state),
    });
    return {audio, player, changes, state: () => changes.at(-1)};
};

test('cold metadata waits for canplay, then reveals text with actual narration', async () => {
    const {audio, player, state} = fixture();
    audio.readyState = 0;
    player.start();
    await delay();
    assert.equal(audio.playCalls, 0);
    assert.equal(state().visibleElements, 0);
    assert.equal(state().hasFinished, false);
    audio.readyState = 4;
    audio.dispatchEvent(new Event('canplay'));
    await delay();
    assert.equal(state().status, 'PLAYING');
    assert.equal(state().visibleElements, 1);
    audio.currentTime = 2.5;
    audio.dispatchEvent(new Event('timeupdate'));
    assert.equal(state().visibleElements, 2);
    player.destroy();
});

test('blocked autoplay stays incomplete and a manual gesture starts playback synchronously', async () => {
    const {audio, player, state} = fixture();
    audio.failures.push(namedError('NotAllowedError'));
    player.start();
    await delay();
    assert.equal(state().status, 'BLOCKED');
    assert.equal(state().visibleElements, 0);
    assert.equal(state().hasFinished, false);
    player.toggle();
    assert.equal(audio.playCalls, 2);
    await delay();
    assert.equal(state().status, 'PLAYING');
    assert.equal(state().visibleElements, 1);
    player.destroy();
});

test('an error that occurred before listeners attached still retries once', async () => {
    const {audio, player, state} = fixture();
    audio.readyState = 0;
    audio.error = {code: 4};
    player.start();
    await delay();
    assert.equal(state().status, 'LOADING');
    audio.dispatchEvent(new Event('error'));
    await delay(270);
    assert.equal(audio.loadCalls, 1);
    assert.equal(audio.playCalls, 1);
    assert.equal(state().status, 'PLAYING');
    assert.equal(state().visibleElements, 1);
    player.destroy();
});

test('a transient startup rejection reloads once and recovers without completing the guide', async () => {
    const {audio, player, state} = fixture();
    audio.failures.push(namedError('AbortError'));
    player.start();
    await delay();
    assert.equal(state().status, 'LOADING');
    assert.equal(state().hasFinished, false);
    await delay(270);
    assert.equal(audio.loadCalls, 1);
    assert.equal(audio.playCalls, 2);
    assert.equal(state().status, 'PLAYING');
    assert.equal(state().visibleElements, 1);
    player.destroy();
});

test('repeated startup failures show an error until an explicit retry succeeds', async () => {
    const {audio, player, state, changes} = fixture();
    audio.failures.push(namedError('NotSupportedError'), namedError('NotSupportedError'));
    player.start();
    await delay(280);
    assert.equal(audio.playCalls, 2);
    assert.equal(state().status, 'ERROR');
    assert.equal(state().visibleElements, 0);
    assert.ok(changes.every(s => !s.hasFinished));
    player.toggle();
    await delay();
    assert.equal(state().status, 'PLAYING');
    assert.equal(state().visibleElements, 1);
    player.destroy();
});

test('a media error during playback is retryable and never reveals all instructions', async () => {
    const {audio, player, state} = fixture();
    player.start();
    await delay();
    audio.currentTime = 2.5;
    audio.dispatchEvent(new Event('timeupdate'));
    audio.error = {code: 2};
    audio.dispatchEvent(new Event('error'));
    assert.equal(state().status, 'ERROR');
    assert.equal(state().visibleElements, 2);
    assert.equal(state().hasFinished, false);
    assert.equal(audio.paused, true);
    player.toggle();
    await delay();
    assert.equal(audio.loadCalls, 1);
    assert.equal(state().visibleElements, 1);
    player.destroy();
});

test('StrictMode cleanup cancels old startup and stale promises cannot change the next player', async () => {
    const audio = new FakeAudio();
    const first = fixture(audio);
    first.player.start();
    first.player.destroy();
    const second = fixture(audio);
    second.player.start();
    await delay();
    assert.equal(audio.playCalls, 1);
    assert.equal(first.changes.length, 1);
    assert.equal(second.state().status, 'PLAYING');
    second.player.destroy();

    let rejectPlayback;
    audio.play = () => new Promise((_, reject) => {rejectPlayback = reject;});
    const pending = fixture(audio);
    pending.player.toggle();
    pending.player.destroy();
    const oldChangeCount = pending.changes.length;
    rejectPlayback(namedError('NotAllowedError'));
    await delay();
    assert.equal(pending.changes.length, oldChangeCount);
});

test('pausing cancels pending recovery and canplay does not resume paused narration', async () => {
    const {audio, player, state} = fixture();
    player.start();
    await delay();
    player.toggle();
    audio.dispatchEvent(new Event('canplay'));
    await delay();
    assert.equal(state().status, 'PAUSED');
    assert.equal(audio.playCalls, 1);
    player.destroy();

    const recovering = fixture();
    recovering.audio.failures.push(namedError('AbortError'));
    recovering.player.start();
    await delay();
    recovering.player.destroy();
    await delay(270);
    assert.equal(recovering.audio.playCalls, 1);
});

test('only a real ending enables completion and replay restarts the reveal', async () => {
    const {audio, player, state} = fixture();
    audio.ended = true;
    audio.dispatchEvent(new Event('ended'));
    assert.equal(state().hasFinished, false);
    player.start();
    await delay();
    audio.ended = true;
    audio.currentTime = audio.duration;
    audio.dispatchEvent(new Event('ended'));
    assert.equal(state().hasFinished, true);
    assert.equal(state().visibleElements, 5);
    audio.paused = true;
    player.toggle();
    await delay();
    assert.equal(state().hasFinished, false);
    assert.equal(state().visibleElements, 1);
    player.destroy();
});
