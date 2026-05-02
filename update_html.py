import re

with open('recovery-compass.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace <style>...</style>
style_links = """  <link rel="stylesheet" href="frontend/css/tokens.css">
  <link rel="stylesheet" href="frontend/css/base.css">
  <link rel="stylesheet" href="frontend/css/components.css">
  <link rel="stylesheet" href="frontend/css/landing.css">
  <link rel="stylesheet" href="frontend/css/onboarding.css">
  <link rel="stylesheet" href="frontend/css/patient.css">
  <link rel="stylesheet" href="frontend/css/coach.css">
  <link rel="stylesheet" href="frontend/css/progress.css">
  <link rel="stylesheet" href="frontend/css/facility.css">
  <link rel="stylesheet" href="frontend/css/overlays.css">
  <link rel="stylesheet" href="frontend/css/utilities.css">"""

text = re.sub(r'<style>.*?</style>', style_links, text, flags=re.DOTALL)

# Replace <script>...RC...</script>
script_link = '<script type="module" src="frontend/js/app.js"></script>'
text = re.sub(r'<script>\s*// ══════.*?</script>', script_link, text, flags=re.DOTALL)

# There's also an empty <script> block right before the big one, let's clean it up
text = re.sub(r'<script>\s*</script>\s*</body>', '</body>', text, flags=re.DOTALL)

with open('recovery-compass.html', 'w', encoding='utf-8') as f:
    f.write(text)

print('Successfully updated recovery-compass.html')
