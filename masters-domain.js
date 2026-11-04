/* Integer cents only. Shared by the browser and runnable domain checks. */
(function (root) {
  'use strict';
  const dates = (end = '2027-06-30') => {
    const result = [];
    for (const d = new Date('2026-10-21T12:00:00Z'); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 7)) result.push(d.toISOString().slice(0, 10));
    return result;
  };
  function cell(player, training, attendance, allocations) {
    const status = attendance.find(a => a.player_id === player.id && a.training_id === training.id)?.status || 'pending';
    const due = player.attendance_eligible === true && training.status === 'closed' && status === 'absent' ? 100 : 0;
    const paid = allocations.filter(a => a.player_id === player.id && a.training_id === training.id).reduce((n, a) => n + a.amount_cents, 0);
    return {status, due, paid, balance: due - paid};
  }
  function statistics(players, trainings, attendance, allocations) {
    return players.map(p => {
      const cells = trainings.filter(t => p.attendance_eligible === true && t.status === 'closed').map(t => cell(p, t, attendance, allocations)).filter(c => c.status !== 'pending');
      const present = cells.filter(c => c.status === 'present').length;
      const absent = cells.filter(c => c.status === 'absent').length;
      const excused = cells.filter(c => c.status === 'excused').length;
      return {...p, present, absent, excused, rate: cells.length ? present / cells.length : null,
        due: cells.reduce((n, c) => n + c.due, 0), paid: cells.reduce((n, c) => n + c.paid, 0), balance: cells.reduce((n, c) => n + c.balance, 0)};
    }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.display_name.localeCompare(b.display_name, 'pt'));
  }
  function memberProfile(name) {
    const key = name.trim().normalize('NFC').toLocaleLowerCase('pt-PT');
    const sports_role = key === 'aires' ? 'coach' : key === 'pereira' ? 'president' : 'player';
    return {display_name:name.trim(), sports_role, playing_position:key === 'seabra' ? 'médio' : null, attendance_eligible:sports_role === 'player' ? true : null};
  }
  const api = {dates, cell, statistics, memberProfile};
  if (typeof module !== 'undefined') module.exports = api; else root.MastersDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);
