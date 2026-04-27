---
layout: default
title: "首页"
---

<section class="card card-pad">
  <h1 class="hero-title" style="margin:0">个人主页</h1>
  <p class="muted" style="margin-top:8px">{{ site.description }}</p>
  <div class="row" style="margin-top:12px">
    <a class="btn primary" href="{{ '/blog/' | relative_url }}">进入博客</a>
    <a class="btn" href="{{ '/apps/pomodoro/' | relative_url }}">番茄钟</a>
    <a class="btn" href="{{ '/apps/global-fm/' | relative_url }}">全球FM</a>
  </div>
</section>

<section class="card card-pad" style="margin-top:12px">
  <div class="row" style="align-items:center;justify-content:space-between">
    <h2 style="margin:0">最新文章</h2>
    <a class="btn" href="{{ '/blog/' | relative_url }}">查看全部</a>
  </div>
  <div class="post-list">
    {% assign posts = site.posts | slice: 0, 8 %}
    {% for post in posts %}
      <a class="card card-pad post-item" href="{{ post.url | relative_url }}">
        <h3 class="post-title">{{ post.title }}</h3>
        <div class="post-meta">{{ post.date | date: "%Y-%m-%d" }}{% if post.tags %} · {{ post.tags | join: " · " }}{% endif %}</div>
        {% if post.excerpt %}
          <p class="post-excerpt">{{ post.excerpt }}</p>
        {% endif %}
      </a>
    {% endfor %}
  </div>
</section>
