import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Update the filter dropdown
old_filter = """              <option value="foglalt">Időpontfoglalás</option>
              <option value="irrelevant">Spam / Irreleváns</option>
            </select>"""

new_filter = """              <option value="foglalt">Időpontfoglalás</option>
              <option value="irrelevant">Spam / Irreleváns</option>
              <option value="other">Egyéb</option>
            </select>"""

content = content.replace(old_filter, new_filter)

# 2. Update the Javascript filtering logic
old_js_filter = """               if (filterCat === 'ajanlat') return stage === 'ajanlat';
               if (filterCat === 'foglalt') return stage === 'foglalt';
               if (filterCat === 'irrelevant') return stage === 'irrelevant';
               return true;
           });"""

new_js_filter = """               if (filterCat === 'ajanlat') return stage === 'ajanlat';
               if (filterCat === 'foglalt') return stage === 'foglalt';
               if (filterCat === 'irrelevant') return stage === 'irrelevant';
               if (filterCat === 'other') return !tags.length && !['ajanlat', 'foglalt', 'irrelevant'].includes(stage);
               return true;
           });"""

content = content.replace(old_js_filter, new_js_filter)

# 3. Update the tag generation logic
old_tag_logic = """          // Show funnel stage if relevant and no tags
          if (!tagHtml && c.funnel_stage) {
            const dispStage = localMap[c.funnel_stage];
            if (dispStage) {
               tagHtml += `<div class="approval-card-tag" style="background: var(--bg2); color: var(--text-muted); border-color: var(--border);">${dispStage}</div>`;
            }
          }"""

new_tag_logic = """          // Show funnel stage if relevant and no tags
          if (!tagHtml) {
            let dispStage = localMap[c.funnel_stage];
            if (!dispStage) {
               dispStage = 'Egyéb'; // Fallback for unknown/empty stages like 'relevant', 'valaszolt'
            }
            tagHtml += `<div class="approval-card-tag" style="background: var(--bg2); color: var(--text-muted); border-color: var(--border);">${dispStage}</div>`;
          }"""

content = content.replace(old_tag_logic, new_tag_logic)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
