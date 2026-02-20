'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@/lib/types';

const statusLabelMap: Record<SupportTicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  resolved: 'Gelöst',
  closed: 'Geschlossen',
};

const priorityLabelMap: Record<SupportTicketPriority, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

export default function SupportTicketKundenPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const selectedTicketIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedTicketIdRef.current = selectedTicketId;
  }, [selectedTicketId]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);

    const { data, error } = await supabaseBrowser
      .from('support_tickets')
      .select('id, organization_id, created_by, subject, description, status, priority, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      setTicketsError(error.message);
      setTicketsLoading(false);
      return;
    }

    const nextTickets = (data || []) as SupportTicket[];
    setTickets(nextTickets);
    setTicketsError(null);
    setTicketsLoading(false);

    setSelectedTicketId((current) => {
      if (!nextTickets.length) return null;
      if (current && nextTickets.some((ticket) => ticket.id === current)) return current;
      return nextTickets[0].id;
    });
  }, []);

  const loadMessagesForTicket = useCallback(async (ticketId: string) => {
    setMessagesLoading(true);

    const { data, error } = await supabaseBrowser
      .from('support_ticket_messages')
      .select('id, ticket_id, organization_id, author_id, author_role, message, created_at, updated_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      setMessagesError(error.message);
      setMessagesLoading(false);
      return;
    }

    setMessages((data || []) as SupportTicketMessage[]);
    setMessagesError(null);
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      setMessagesError(null);
      setMessagesLoading(false);
      return;
    }

    void loadMessagesForTicket(selectedTicketId);
  }, [selectedTicketId, loadMessagesForTicket]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel('support-ticket-kunden-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        async () => {
          await loadTickets();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_ticket_messages' },
        async (payload) => {
          const payloadTicketId =
            (payload.new as { ticket_id?: string } | null)?.ticket_id ||
            (payload.old as { ticket_id?: string } | null)?.ticket_id ||
            null;

          const currentTicketId = selectedTicketIdRef.current;
          if (!currentTicketId) return;

          if (!payloadTicketId || payloadTicketId === currentTicketId) {
            await loadMessagesForTicket(currentTicketId);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setTicketsError('Realtime-Verbindung fehlgeschlagen. Bitte Seite neu laden.');
        }
      });

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [loadTickets, loadMessagesForTicket]);

  return (
    <div className="grid">
      <div className="card">
        <h2>Support Ticket Kunden</h2>
        <p className="note">Read-only Ansicht der synchronisierten Tickets aus dem Quellprojekt.</p>
      </div>

      <div className="support-layout">
        <div className="card">
          <div className="support-panel-header">
            <h3>Tickets</h3>
            {!ticketsLoading && <span className="note">{tickets.length}</span>}
          </div>

          {ticketsLoading && <p className="support-loading">Tickets werden geladen...</p>}
          {!ticketsLoading && ticketsError && <p className="support-error">{ticketsError}</p>}
          {!ticketsLoading && !ticketsError && tickets.length === 0 && (
            <p className="support-empty">Keine Tickets vorhanden.</p>
          )}

          {!ticketsLoading && !ticketsError && tickets.length > 0 && (
            <ul className="ticket-list">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="ticket-item">
                  <button
                    type="button"
                    className={`ticket-item-btn ${ticket.id === selectedTicketId ? 'active' : ''}`}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <div className="ticket-item-top">
                      <span className="ticket-item-subject">{ticket.subject}</span>
                    </div>
                    <div className="ticket-item-meta">
                      <span className={`badge status-${ticket.status}`}>{statusLabelMap[ticket.status]}</span>
                      <span className={`badge priority-${ticket.priority}`}>{priorityLabelMap[ticket.priority]}</span>
                      <span className="note">{formatDateTime(ticket.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>Nachrichten-Thread</h3>

          {!selectedTicket && !ticketsLoading && !ticketsError && (
            <p className="support-empty">Bitte ein Ticket auswählen.</p>
          )}

          {selectedTicket && (
            <>
              <div className="ticket-thread-header">
                <h4>{selectedTicket.subject}</h4>
                <div className="ticket-thread-badges">
                  <span className={`badge status-${selectedTicket.status}`}>{statusLabelMap[selectedTicket.status]}</span>
                  <span className={`badge priority-${selectedTicket.priority}`}>{priorityLabelMap[selectedTicket.priority]}</span>
                </div>
              </div>
              <p className="note">Organisation: {selectedTicket.organization_id}</p>
              <p className="ticket-description">{selectedTicket.description}</p>

              {messagesLoading && <p className="support-loading">Nachrichten werden geladen...</p>}
              {!messagesLoading && messagesError && <p className="support-error">{messagesError}</p>}
              {!messagesLoading && !messagesError && messages.length === 0 && (
                <p className="support-empty">Für dieses Ticket sind noch keine Nachrichten vorhanden.</p>
              )}

              {!messagesLoading && !messagesError && messages.length > 0 && (
                <div className="message-thread">
                  {messages.map((entry) => (
                    <div
                      key={entry.id}
                      className={`message-item ${entry.author_role === 'support' ? 'role-support' : 'role-operator'}`}
                    >
                      <div className="message-meta">
                        <span className="badge">{entry.author_role === 'support' ? 'Support' : 'Operator'}</span>
                        <span className="note">{formatDateTime(entry.created_at)}</span>
                      </div>
                      <p>{entry.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
