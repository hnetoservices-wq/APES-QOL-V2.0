(() => {
  'use strict';
  const DAY = 86400000;
  const pad = value => String(value).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  function ordinal(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (y < 1970 || y > 9999) return null;
    const stamp = Date.UTC(y, m - 1, d), date = new Date(stamp);
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? stamp / DAY : null;
  }
  const ordinalKey = value => new Date(value * DAY).toISOString().slice(0, 10);
  function atTime(day, time) {
    const [y, m, d] = ordinalKey(day).split('-').map(Number), [h, minute] = time.split(':').map(Number);
    return new Date(y, m - 1, d, h, minute, 0, 0).getTime();
  }
  function validate(value) {
    if (!String(value.text || '').trim() || String(value.text).trim().length > 160) throw Error('Enter a reminder between 1 and 160 characters.');
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time || '')) throw Error('Choose a valid time.');
    if (ordinal(value.startDate) === null) throw Error('Choose a valid start date.');
    if (value.endDate && (ordinal(value.endDate) === null || value.endDate < value.startDate)) throw Error('End date must be on or after the start date.');
    if (!['once', 'daily', 'weekdays', 'interval'].includes(value.repeat)) throw Error('Choose a repeat schedule.');
    if (value.repeat === 'weekdays' && (!Array.isArray(value.days) || !value.days.length || value.days.some(day => !Number.isInteger(day) || day < 0 || day > 6))) throw Error('Select at least one weekday.');
    if (value.repeat === 'interval' && (!Number.isInteger(Number(value.interval)) || Number(value.interval) < 1 || Number(value.interval) > 365)) throw Error('Choose an interval between 1 and 365 days.');
    return {
      text: String(value.text).trim(), time: value.time, startDate: value.startDate, endDate: value.endDate || '',
      repeat: value.repeat, days: [...new Set(value.days || [])].filter(day => Number.isInteger(day) && day >= 0 && day <= 6),
      interval: value.repeat === 'interval' ? Number(value.interval) : 1, enabled: value.enabled !== false, sound: value.sound === true
    };
  }
  function normalize(value) {
    try {
      const schedule = validate(value);
      if (typeof value.id !== 'string' || !value.id || value.id.length > 100) return null;
      const handledKey = ordinal(value.handledKey) === null ? '' : value.handledKey;
      const snooze = value.snooze && ordinal(value.snooze.key) !== null && Number.isFinite(value.snooze.until)
        ? { key: value.snooze.key, until: value.snooze.until } : null;
      return { id: value.id, ...schedule, handledKey, snooze };
    } catch (_) { return null; }
  }
  function latest(reminder, now = Date.now()) {
    if (!reminder.enabled || !Number.isFinite(now)) return null;
    const start = ordinal(reminder.startDate);
    let day = ordinal(dateKey(new Date(now)));
    if (atTime(day, reminder.time) > now) day--;
    if (reminder.endDate) day = Math.min(day, ordinal(reminder.endDate));
    if (day < start) return null;
    if (reminder.repeat === 'once') day = start;
    else if (reminder.repeat === 'interval') day -= (day - start) % reminder.interval;
    else if (reminder.repeat === 'weekdays') {
      for (let back = 0; back < 7; back++, day--) {
        if (reminder.days.includes(new Date(day * DAY).getUTCDay())) break;
      }
      if (day < start) return null;
    }
    const key = ordinalKey(day), at = atTime(day, reminder.time);
    return at <= now ? { key, at } : null;
  }
  function due(reminder, now = Date.now()) {
    const occurrence = latest(reminder, now);
    if (!occurrence || reminder.handledKey && reminder.handledKey >= occurrence.key) return null;
    if (reminder.snooze?.key === occurrence.key && reminder.snooze.until > now) return null;
    return occurrence;
  }
  window.APES_REMINDER_SCHEDULE = Object.freeze({ dateKey, validate, normalize, latest, due });
})();
