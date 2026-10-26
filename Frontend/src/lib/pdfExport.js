import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Export a summary as a beautifully formatted PDF revision sheet
 * @param {Object} summary - The summary object with all its data
 */
export async function exportSummaryToPDF(summary) {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - 2 * margin
    let yPosition = margin

    // Helper function to check if we need a new page
    const checkNewPage = (requiredSpace = 20) => {
      if (yPosition + requiredSpace > pageHeight - margin) {
        doc.addPage()
        yPosition = margin
        return true
      }
      return false
    }

    // Header with branding
    doc.setFillColor(79, 70, 229)
    doc.rect(0, 0, pageWidth, 35, 'F')
    
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('EduMind AI', margin, 15)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Fiche de Révision', margin, 23)
    
    const today = new Date().toLocaleDateString('fr-FR', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
    doc.setFontSize(9)
    doc.text(today, pageWidth - margin, 23, { align: 'right' })
    
    yPosition = 45

    // Course title
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 114, 128)
    doc.text(summary.course_title.toUpperCase(), margin, yPosition)
    yPosition += 8

    // Summary title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    const titleLines = doc.splitTextToSize(summary.title, contentWidth)
    doc.text(titleLines, margin, yPosition)
    yPosition += titleLines.length * 7 + 5

    // Metadata
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    const metadata = []
    if (summary.source === 'ai') metadata.push('✨ Généré par IA')
    metadata.push(`Par ${summary.author_name}`)
    doc.text(metadata.join(' • '), margin, yPosition)
    yPosition += 10

    // Tags
    if (summary.tags && summary.tags.length > 0) {
      doc.setDrawColor(229, 231, 235)
      doc.setFillColor(249, 250, 251)
      doc.roundedRect(margin, yPosition, contentWidth, 12, 2, 2, 'FD')
      doc.setFontSize(9)
      doc.setTextColor(75, 85, 99)
      doc.text('🏷️ ' + summary.tags.join(' • '), margin + 3, yPosition + 7)
      yPosition += 16
    }

    // Divider
    doc.setDrawColor(229, 231, 235)
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 8

    // Content header
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('📖 Résumé du Cours', margin, yPosition)
    yPosition += 8

    // Content body
    const contentLines = summary.content.split('\n')
    for (const line of contentLines) {
      if (!line.trim()) {
        yPosition += 2
        continue
      }

      if (line.startsWith('## ')) {
        checkNewPage(15)
        yPosition += 3
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(79, 70, 229)
        const headerLines = doc.splitTextToSize(line.substring(3), contentWidth)
        doc.text(headerLines, margin, yPosition)
        yPosition += headerLines.length * 5 + 2
      } else if (line.startsWith('- ')) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 0)
        const bulletLines = doc.splitTextToSize(line.substring(2), contentWidth - 5)
        checkNewPage(bulletLines.length * 5)
        doc.text('•', margin + 2, yPosition)
        doc.text(bulletLines, margin + 7, yPosition)
        yPosition += bulletLines.length * 4.5 + 1
      } else {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 0)
        const paraLines = doc.splitTextToSize(line, contentWidth)
        checkNewPage(paraLines.length * 5)
        doc.text(paraLines, margin, yPosition)
        yPosition += paraLines.length * 4.5 + 2
      }
    }

    yPosition += 8

    // Key Concepts
    if (summary.key_concepts && summary.key_concepts.length > 0) {
      checkNewPage(50)
      
      doc.setFillColor(254, 243, 199)
      doc.roundedRect(margin, yPosition, contentWidth, 8, 2, 2, 'F')
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(146, 64, 14)
      doc.text('💡 Concepts Clés', margin + 3, yPosition + 5.5)
      yPosition += 12

      const conceptsData = summary.key_concepts.map(c => [c.term, c.definition])
      
      autoTable(doc, {
        startY: yPosition,
        head: [['Terme', 'Définition']],
        body: conceptsData,
        theme: 'grid',
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 9,
          cellPadding: 3,
        },
        columnStyles: {
          0: { cellWidth: 45, fontStyle: 'bold' },
          1: { cellWidth: contentWidth - 45 },
        },
        margin: { left: margin, right: margin },
      })

      yPosition = doc.lastAutoTable.finalY + 10
    }

    // Illustration
    if (summary.illustration_url) {
      checkNewPage(80)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('🎨 Illustration Explicative', margin, yPosition)
      yPosition += 8

      try {
        const fullUrl = summary.illustration_url.startsWith('http') 
          ? summary.illustration_url 
          : `${window.location.origin}${summary.illustration_url}`
        
        const imageData = await loadImageSafely(fullUrl)
        if (imageData) {
          const imgWidth = contentWidth
          const imgHeight = (imgWidth * 9) / 16
          doc.addImage(imageData, 'JPEG', margin, yPosition, imgWidth, imgHeight)
          yPosition += imgHeight + 5

          if (summary.illustration_prompt) {
            doc.setFontSize(8)
            doc.setFont('helvetica', 'italic')
            doc.setTextColor(107, 114, 128)
            const promptLines = doc.splitTextToSize(`Prompt IA: ${summary.illustration_prompt}`, contentWidth)
            doc.text(promptLines, margin, yPosition)
            yPosition += promptLines.length * 3 + 5
          }
        } else {
          throw new Error('Image not loaded')
        }
      } catch (error) {
        console.warn('Illustration skipped:', error.message)
        doc.setFontSize(9)
        doc.setTextColor(150, 150, 150)
        doc.text('(Illustration disponible en ligne uniquement)', margin, yPosition)
        yPosition += 10
      }
    }

    // Footer
    const totalPages = doc.internal.pages.length - 1
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(150, 150, 150)
      doc.text(
        `EduMind AI - ${today} - Page ${i}/${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      )
    }

    // Save
    const fileName = `${summary.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`
    doc.save(fileName)
    
    return true
  } catch (error) {
    console.error('PDF generation error:', error)
    throw new Error(`Échec de la génération du PDF: ${error.message}`)
  }
}

/**
 * Load image with proper error handling
 */
async function loadImageSafely(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    const timeout = setTimeout(() => {
      console.warn('Image load timeout')
      resolve(null)
    }, 5000)
    
    img.onload = () => {
      clearTimeout(timeout)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (error) {
        console.error('Canvas error:', error)
        resolve(null)
      }
    }
    
    img.onerror = () => {
      clearTimeout(timeout)
      console.warn('Image load failed')
      resolve(null)
    }
    
    img.src = url
  })
}
