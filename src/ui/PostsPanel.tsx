import { useSim } from '../store/simStore';

export function PostsPanel() {
  const posts = useSim((s) => s.posts);
  return (
    <div className="panel-body">
      {posts.length === 0 && <p className="empty">Nadie ha publicado nada todavía.</p>}
      {[...posts].reverse().map((p, i) => (
        <article key={i} className="post">
          <header><strong>@{p.author.replace(/\s+/g, '_')}</strong> <span className="dim">t{p.tick}</span></header>
          <p>{p.text}</p>
        </article>
      ))}
    </div>
  );
}
