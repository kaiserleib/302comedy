document.getElementById('hamburger-menu').addEventListener('click', function() {
    var menu = document.getElementById('mobile-menu');
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
});