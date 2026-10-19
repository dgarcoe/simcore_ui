import { useEffect, useState } from 'react';
import { bus } from '../store/bus';
import { useSim } from '../store/simStore';
import type { ThemePack } from '../themes/types';
import { AgentsPanel } from './AgentsPanel';
import { ChatPanel } from './ChatPanel';
import { EventsPanel } from './EventsPanel';
import { PostsPanel } from './PostsPanel';
import { StoryPanel } from './StoryPanel';

type Tab = 'chat' | 'events' | 'agents' | 'story' | 'posts';

export function Sidebar({ theme }: { theme: ThemePack }) {
  const [tab, setTab] = useState<Tab>('chat');
  const convCount = useSim((s) => s.conversations.length);
  const postCount = useSim((s) => s.posts.length);
  const chapterCount = useSim((s) => s.chapters.length);
  const current = tab;
  useEffect(() => bus.on('openTab', (t) => setTab(t)), []);

  const tabs: Array<[Tab, string]> = [
    ['chat', `Charlas${convCount ? ` ${convCount}` : ''}`],
    ['events', 'Sucesos'],
    ['agents', 'Agentes'],
    ['story', `Historia${chapterCount ? ` ${chapterCount}` : ''}`],
  ];
  if (postCount) tabs.push(['posts', `Red ${postCount}`]);

  return (
    <aside className="sidebar">
      <nav className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={current === id} className={`tab ${current === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {current === 'chat' && <ChatPanel theme={theme} />}
      {current === 'events' && <EventsPanel />}
      {current === 'agents' && <AgentsPanel theme={theme} />}
      {current === 'story' && <StoryPanel />}
      {current === 'posts' && <PostsPanel />}
    </aside>
  );
}
