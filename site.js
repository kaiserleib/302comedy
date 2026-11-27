/* 302comedy.com: mailing-list forms and keeping the show list honest.

   Every .list-form posts to the Kit form "302 Comedy site signup" (see
   KIT_FORM), the same endpoint Kit's own embed uses. It asks for an email
   and a ZIP code. The ZIP is stored in Kit's custom field "Zip code"
   (fields[zip_code]), so a show's email can go to everyone within reach of
   the venue, wherever we book next. Each signup also gets two tags: a
   `Town - …` tag worked out from the ZIP (townTag below), which keeps new
   signups in step with subscribers who only have a town, and the source in
   data-source (26302972 "302 site signup" on the homepage, 26302973
   "302 Montana ads signup" on /montana/).

   A confirmed signup sends Meta a Lead with the form's data-lead as
   content_name, so ad-driven signups can be told apart on the shared pixel. */
(function () {
    var KIT_FORM = 'https://app.kit.com/forms/10228317/subscriptions';

    /* ZIP codes that count as each town we already tag for, with the places
       that drive in to it. Any other Montana ZIP (they all start 59) is
       "Elsewhere in Montana"; the ZIP itself is what places those people. */
    var TOWNS = [
        ['26302974', /^(5960[124]|5962[03456]|5963[4568])$/],          // Helena, East Helena, Clancy, Montana City
        ['26302975', /^(59641|59643|59644|59647)$/],                   // Townsend, Toston, Winston, Radersburg
        ['26302976', /^(5980[1-8]|59812|59823|59834|59847|59851)$/],   // Missoula, Bonner, Frenchtown, Lolo
        ['26302977', /^(5971[45789]|5977[12]|59730|59741)$/]           // Bozeman, Belgrade, Gallatin Gateway, Manhattan
    ];
    function townTag(zip) {
        for (var i = 0; i < TOWNS.length; i++) if (TOWNS[i][1].test(zip)) return TOWNS[i][0];
        return /^59/.test(zip) ? '26302978' : '26302979';   // elsewhere in Montana : outside Montana
    }

    document.querySelectorAll('.list-form').forEach(function (form) {
        var status = form.parentNode.querySelector('.list-status');
        var email = form.querySelector('input[type=email]');
        var zip = form.querySelector('input.zip');

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!email.checkValidity()) {
                status.textContent = 'That email address doesn’t look right.';
                email.focus();
                return;
            }
            zip.value = zip.value.trim().slice(0, 5);
            if (!/^[0-9]{5}$/.test(zip.value)) {
                status.textContent = 'Add your five-digit ZIP code, so we only send you shows you can get to.';
                zip.focus();
                return;
            }
            var body = new FormData(form);
            body.append('tags[]', townTag(zip.value));
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
                    form.remove();
                    status.textContent = 'You’re on the list. We’ll email you when there’s a show near you.';
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
