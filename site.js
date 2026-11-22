/* 302comedy.com: mailing-list forms and keeping the show list honest.

   Every .list-form posts to the Kit form "302 Comedy site signup" (see
   KIT_FORM), the same endpoint Kit's own embed uses. Each form carries two
   tags: the town chosen in its <select name="tags[]">, and the source in
   data-source (26302972 "302 site signup" on the homepage, 26302973
   "302 Montana ads signup" on /montana/). Town tags let a broadcast go only
   to people near the show.

   A confirmed signup sends Meta a Lead with the form's data-lead as
   content_name, so ad-driven signups can be told apart on the shared pixel. */
(function () {
    var KIT_FORM = 'https://app.kit.com/forms/10228317/subscriptions';

    document.querySelectorAll('.list-form').forEach(function (form) {
        var status = form.parentNode.querySelector('.list-status');
        var email = form.querySelector('input[type=email]');
        var town = form.querySelector('select');

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!email.checkValidity()) {
                status.textContent = 'That email address doesn’t look right.';
                email.focus();
                return;
            }
            if (!town.value) {
                status.textContent = 'Pick the town nearest you, so we only send you shows you can get to.';
                town.focus();
                return;
            }
            var body = new FormData(form);
            body.append('tags[]', form.getAttribute('data-source'));
            var button = form.querySelector('button');
            button.disabled = true;
            status.textContent = 'Signing you up…';

            fetch(KIT_FORM, {method: 'POST', body: body, headers: {Accept: 'application/json'}})
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    // Kit's bot guard holds some signups until the visitor
                    // passes a check on its own page.
                    if (data.status === 'quarantined' && data.url) {
                        status.innerHTML = 'Almost done: <a target="_blank" rel="noopener" href="' +
                            encodeURI(data.url) + '">confirm you’re not a robot</a>.';
                        button.disabled = false;
                        return;
                    }
                    if (data.status !== 'success') throw new Error(data.status);
                    var place = town.options[town.selectedIndex].text;
                    form.remove();
                    status.textContent = /Montana/.test(place)
                        ? 'You’re on the list. We’ll email you when there’s a show near you.'
                        : 'You’re on the list. We’ll email you when there’s a show near ' + place + '.';
                    status.classList.add('done');
                    try {
                        if (window.fbq) fbq('track', 'Lead', {content_name: form.getAttribute('data-lead')});
                    } catch (e) {}
                })
                .catch(function () {
                    button.disabled = false;
                    status.innerHTML = 'Something went wrong. Try again, or email ' +
                        '<a href="mailto:kaiser@302comedy.com">kaiser@302comedy.com</a>.';
                });
        });
    });

    /* The list is rebuilt from Eventbrite several times a day. If that job
       ever stalls, still drop shows once they are over. */
    var now = Date.now();
    document.querySelectorAll('[data-ends]').forEach(function (el) {
        if (new Date(el.getAttribute('data-ends')).getTime() < now) {
            var list = el.parentNode;
            el.remove();
            if (!list.children.length) {
                var section = list.closest('.road, .next');
                if (section) section.remove();
                else list.outerHTML = '<p class="empty">No Montana dates on sale this minute. ' +
                    'New shows go to the list first: <a href="#list">get on it</a>.</p>';
            }
        }
    });
})();
