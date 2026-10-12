import { useCallback, useEffect, useState } from 'react';
import { PAGE_SIZE } from '../lib/constants.js';
import { getTicket, listTickets } from '../services/ticketService.js';
import { useAuth } from './useAuth.js';

const INITIAL_FILTERS = {
  search: '',
  status: '',
  priority: '',
  category: '',
  assignee: '',
  from: '',
  to: '',
  sort: 'updated',
  page: 0,
};

export function useTicketList(scope) {
  const { user } = useAuth();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await listTickets({
      scope,
      userId: user?.id,
      ...filters,
      pageSize: PAGE_SIZE,
    });
    setTickets(result.tickets);
    setCount(result.count);
    setError(result.error || '');
    setLoading(false);
  }, [scope, user?.id, filters]);

  useEffect(() => {
    reload();
  }, [reload]);

  function updateFilters(partial) {
    setFilters((current) => ({
      ...current,
      ...partial,
      page: Object.prototype.hasOwnProperty.call(partial, 'page') ? partial.page : 0,
    }));
  }

  return {
    tickets,
    count,
    loading,
    error,
    filters,
    updateFilters,
    reload,
    pageSize: PAGE_SIZE,
  };
}

export function useTicket(ticketId) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    const result = await getTicket(ticketId);
    setTicket(result.ticket);
    setError(result.error || '');
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ticket, loading, error, reload, setTicket };
}
