---
layout: default
title: "首页"
---

<section class="card card-pad">
  <h1 class="blog-title" style="margin:0">个人博客</h1>
  <p class="muted" style="margin-top:8px">{{ site.description }}</p>
</section>

<section class="card card-pad" style="margin-top:12px">
  <div class="blog-head">
    <h2 class="blog-title" style="margin:0">最新文章</h2>
    <a class="navlink" href="/blog/">查看全部</a>
  </div>
  <div style="margin-top:10px">
    {% assign posts = site.posts | slice: 0, 8 %}
    {% for post in posts %}
      <a class="card card-pad post-item" href="{{ post.url }}" style="display:block;margin-top:10px;text-decoration:none">
        <div class="title">{{ post.title }}</div>
        <div class="muted" style="margin-top:6px">
          {{ post.date | date: "%Y-%m-%d" }}{% if post.tags %} · {{ post.tags | join: " · " }}{% endif %}
        </div>
        {% if post.excerpt %}
          <p class="excerpt muted" style="margin-bottom:0">{{ post.excerpt | strip_html | strip_newlines }}</p>
        {% endif %}
      </a>
    {% endfor %}
  </div>
</section>

<section class="card card-pad" style="margin-top:12px">
  <h2 class="blog-title" style="margin:0">小工具</h2>
  <div class="row" style="margin-top:12px">
    <a class="btn primary" href="/pomodoro/">番茄钟</a>
    <a class="btn primary" href="/global-fm/">全球FM</a>
  </div>
</section>
