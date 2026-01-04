"""
Markdown 导出服务
纯 Python 实现，零外部依赖
"""
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path
import json
import io
import zipfile
import base64


class MarkdownExportService:
    """Markdown 导出服务"""
    
    @staticmethod
    def export_record_to_markdown(record: Dict[str, Any]) -> str:
        """
        将 record 转换为 Markdown 格式
        
        Args:
            record: 数据库记录，包含 text, metadata, created_at 等字段
            
        Returns:
            Markdown 格式的字符串
        """
        lines = []
        metadata = record.get('metadata', {})
        
        # 如果 metadata 是字符串，尝试解析
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        
        blocks = metadata.get('blocks', [])
        
        # 1. 添加 YAML Front Matter（笔记元信息）
        note_info_block = next((b for b in blocks if b.get('type') == 'note-info'), None)
        if note_info_block and note_info_block.get('noteInfo'):
            lines.extend(MarkdownExportService._format_note_info(note_info_block['noteInfo']))
        
        # 添加导出信息
        lines.append(f"*导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*")
        lines.append('')
        lines.append('---')
        lines.append('')
        
        # 2. 遍历 blocks，转换内容
        for block in blocks:
            block_type = block.get('type')
            
            # 跳过特殊块
            if block_type == 'note-info' or block.get('isBufferBlock'):
                continue
            
            # 处理小结块
            if block.get('isSummary'):
                lines.extend(MarkdownExportService._format_summary_block(block))
                continue
            
            # 处理其他类型
            formatted = MarkdownExportService._format_block(block)
            if formatted:
                lines.extend(formatted)
        
        return '\n'.join(lines)
    
    @staticmethod
    def _format_note_info(note_info: Dict[str, Any]) -> List[str]:
        """格式化笔记信息为 YAML Front Matter"""
        lines = ['---']
        
        if note_info.get('title'):
            # 转义双引号
            title = note_info['title'].replace('"', '\\"')
            lines.append(f'title: "{title}"')
        if note_info.get('type'):
            lines.append(f"type: {note_info['type']}")
        if note_info.get('relatedPeople'):
            lines.append(f"people: {note_info['relatedPeople']}")
        if note_info.get('location'):
            lines.append(f"location: {note_info['location']}")
        if note_info.get('startTime'):
            lines.append(f"start_time: {note_info['startTime']}")
        if note_info.get('endTime'):
            lines.append(f"end_time: {note_info['endTime']}")
        
        lines.append('---')
        lines.append('')
        
        return lines
    
    @staticmethod
    def _format_summary_block(block: Dict[str, Any]) -> List[str]:
        """格式化小结块"""
        lines = ['---', '']
        lines.append('> **📝 小结**')
        lines.append('>')
        
        content = block.get('content', '')
        for line in content.split('\n'):
            lines.append(f"> {line}")
        
        lines.append('')
        lines.append('---')
        lines.append('')
        
        return lines
    
    @staticmethod
    def _format_block(block: Dict[str, Any]) -> List[str]:
        """格式化普通块"""
        block_type = block.get('type')
        content = block.get('content', '').strip()
        
        if not content and block_type != 'image':
            return []
        
        lines = []
        
        if block_type == 'paragraph':
            lines.append(content)
            lines.append('')
        
        elif block_type == 'h1':
            lines.append(f"# {content}")
            lines.append('')
        
        elif block_type == 'h2':
            lines.append(f"## {content}")
            lines.append('')
        
        elif block_type == 'h3':
            lines.append(f"### {content}")
            lines.append('')
        
        elif block_type == 'bulleted-list':
            lines.append(f"- {content}")
        
        elif block_type == 'numbered-list':
            lines.append(f"1. {content}")
        
        elif block_type == 'code':
            lines.append('```')
            lines.append(content)
            lines.append('```')
            lines.append('')
        
        elif block_type == 'image':
            image_url = block.get('imageUrl', '')
            image_caption = block.get('imageCaption', '图片')
            
            # 如果是相对路径，转换为完整的 API URL
            if image_url and not image_url.startswith('http'):
                # 转换为 API 服务器的完整 URL
                image_url = f"http://127.0.0.1:8765/api/{image_url}"
            
            lines.append(f"![{image_caption}]({image_url})")
            if image_caption:
                lines.append(f"*{image_caption}*")
            lines.append('')
        
        return lines
    
    @staticmethod
    def export_record_to_zip(record: Dict[str, Any], data_dir: Path) -> bytes:
        """
        将 record 打包为 ZIP 文件（包含 Markdown 和图片）
        
        Args:
            record: 数据库记录
            data_dir: 数据根目录（用于查找图片文件）
            
        Returns:
            ZIP 文件的字节流
        """
        # 1. 生成 Markdown 内容（使用相对路径）
        markdown_content = MarkdownExportService._export_with_relative_paths(record)
        
        # 2. 收集所有图片路径
        image_paths = MarkdownExportService._extract_image_paths(record)
        
        # 3. 创建 ZIP 文件
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # 添加 Markdown 文件
            zip_file.writestr('笔记.md', markdown_content.encode('utf-8'))
            
            # 添加图片文件
            for image_rel_path in image_paths:
                # 构建图片的完整路径
                image_full_path = data_dir / image_rel_path
                
                if image_full_path.exists():
                    # 读取图片并添加到 ZIP
                    with open(image_full_path, 'rb') as img_file:
                        zip_file.writestr(image_rel_path, img_file.read())
                else:
                    print(f"[Export] 警告: 图片不存在 {image_full_path}")
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    @staticmethod
    def _export_with_relative_paths(record: Dict[str, Any]) -> str:
        """
        导出 Markdown，图片使用相对路径（用于 ZIP 打包）
        """
        lines = []
        metadata = record.get('metadata', {})
        
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        
        blocks = metadata.get('blocks', [])
        
        # 添加笔记信息
        note_info_block = next((b for b in blocks if b.get('type') == 'note-info'), None)
        if note_info_block and note_info_block.get('noteInfo'):
            lines.extend(MarkdownExportService._format_note_info(note_info_block['noteInfo']))
        
        # 添加导出信息
        lines.append(f"*导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*")
        lines.append('')
        lines.append('---')
        lines.append('')
        
        # 遍历 blocks
        for block in blocks:
            block_type = block.get('type')
            
            if block_type == 'note-info' or block.get('isBufferBlock'):
                continue
            
            if block.get('isSummary'):
                lines.extend(MarkdownExportService._format_summary_block(block))
                continue
            
            # 特殊处理图片块：使用相对路径
            if block_type == 'image':
                image_url = block.get('imageUrl', '')
                image_caption = block.get('imageCaption', '图片')
                
                # 保持相对路径不变
                lines.append(f"![{image_caption}]({image_url})")
                if image_caption:
                    lines.append(f"*{image_caption}*")
                lines.append('')
            else:
                formatted = MarkdownExportService._format_block(block)
                if formatted:
                    lines.extend(formatted)
        
        return '\n'.join(lines)
    
    @staticmethod
    def _extract_image_paths(record: Dict[str, Any]) -> List[str]:
        """
        从记录中提取所有图片路径
        
        Returns:
            图片相对路径列表，如 ['images/xxx.png', 'images/yyy.png']
        """
        metadata = record.get('metadata', {})
        
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                return []
        
        blocks = metadata.get('blocks', [])
        image_paths = []
        
        for block in blocks:
            if block.get('type') == 'image' and block.get('imageUrl'):
                image_url = block['imageUrl']
                # 只处理相对路径
                if not image_url.startswith('http'):
                    image_paths.append(image_url)
        
        return image_paths


class HtmlExportService:
    """HTML 导出服务（纯 Python 实现，零依赖）"""
    
    @staticmethod
    def export_record_to_html(record: Dict[str, Any], data_dir: Path) -> str:
        """
        将 record 转换为单文件 HTML（图片 Base64 嵌入）
        
        Args:
            record: 数据库记录
            data_dir: 数据根目录（用于读取图片文件）
            
        Returns:
            完整的 HTML 字符串
        """
        metadata = record.get('metadata', {})
        
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        
        blocks = metadata.get('blocks', [])
        
        # 提取笔记信息
        note_info = None
        note_info_block = next((b for b in blocks if b.get('type') == 'note-info'), None)
        if note_info_block:
            note_info = note_info_block.get('noteInfo', {})
        
        # 生成 HTML
        html_parts = []
        
        # 1. HTML 头部
        html_parts.append(HtmlExportService._generate_html_head(note_info))
        
        # 2. 笔记信息卡片
        if note_info:
            html_parts.append(HtmlExportService._generate_note_info_card(note_info))
        
        # 3. 导出信息
        export_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        html_parts.append(f'<p class="export-info">导出时间: {export_time}</p>')
        html_parts.append('<hr class="divider">')
        
        # 4. 内容块
        for block in blocks:
            block_type = block.get('type')
            
            if block_type == 'note-info' or block.get('isBufferBlock'):
                continue
            
            if block.get('isSummary'):
                html_parts.append(HtmlExportService._format_summary_block_html(block))
                continue
            
            formatted = HtmlExportService._format_block_html(block, data_dir)
            if formatted:
                html_parts.append(formatted)
        
        # 5. HTML 尾部
        html_parts.append('</div></body></html>')
        
        return '\n'.join(html_parts)
    
    @staticmethod
    def _generate_html_head(note_info: Dict[str, Any] = None) -> str:
        """生成 HTML 头部（含 CSS）"""
        title = note_info.get('title', '笔记') if note_info else '笔记'
        
        return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{HtmlExportService._escape_html(title)}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            line-height: 1.8;
            color: #333;
            background: #f5f7fa;
            padding: 20px;
        }}
        
        .container {{
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }}
        
        .note-info-card {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px;
            border-radius: 8px;
            margin-bottom: 32px;
        }}
        
        .note-info-card h1 {{
            font-size: 28px;
            margin-bottom: 16px;
            font-weight: 600;
        }}
        
        .note-info-meta {{
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            font-size: 14px;
            opacity: 0.95;
        }}
        
        .note-info-meta-item {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        
        .export-info {{
            color: #999;
            font-size: 13px;
            text-align: right;
            margin-bottom: 12px;
        }}
        
        .divider {{
            border: none;
            border-top: 1px solid #eee;
            margin: 24px 0;
        }}
        
        h1 {{
            font-size: 32px;
            margin: 32px 0 16px;
            font-weight: 600;
            color: #1a1a1a;
        }}
        
        h2 {{
            font-size: 26px;
            margin: 28px 0 14px;
            font-weight: 600;
            color: #2c3e50;
            border-bottom: 2px solid #667eea;
            padding-bottom: 8px;
        }}
        
        h3 {{
            font-size: 22px;
            margin: 24px 0 12px;
            font-weight: 600;
            color: #34495e;
        }}
        
        p {{
            margin: 12px 0;
            text-align: justify;
        }}
        
        ul, ol {{
            margin: 12px 0;
            padding-left: 28px;
        }}
        
        li {{
            margin: 8px 0;
        }}
        
        pre {{
            background: #f6f8fa;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            padding: 16px;
            overflow-x: auto;
            margin: 16px 0;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
            font-size: 14px;
            line-height: 1.6;
        }}
        
        code {{
            background: #f6f8fa;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "SFMono-Regular", Consolas, monospace;
            font-size: 0.9em;
        }}
        
        img {{
            max-width: 100%;
            height: auto;
            margin: 20px 0;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        
        .image-caption {{
            display: block;
            text-align: center;
            font-size: 14px;
            color: #666;
            font-style: italic;
            margin-top: -12px;
            margin-bottom: 20px;
        }}
        
        .summary-block {{
            background: #fffbea;
            border-left: 4px solid #f59e0b;
            padding: 20px;
            margin: 24px 0;
            border-radius: 4px;
        }}
        
        .summary-block h4 {{
            color: #f59e0b;
            font-size: 18px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        
        .summary-block p {{
            color: #78350f;
            margin: 8px 0;
        }}
        
        @media print {{
            body {{
                background: white;
                padding: 0;
            }}
            
            .container {{
                box-shadow: none;
                padding: 0;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">'''
    
    @staticmethod
    def _generate_note_info_card(note_info: Dict[str, Any]) -> str:
        """生成笔记信息卡片"""
        parts = ['<div class="note-info-card">']
        
        if note_info.get('title'):
            title = HtmlExportService._escape_html(note_info['title'])
            parts.append(f'<h1>{title}</h1>')
        
        meta_items = []
        
        if note_info.get('type'):
            meta_items.append(f'<div class="note-info-meta-item">📋 类型: {HtmlExportService._escape_html(note_info["type"])}</div>')
        
        if note_info.get('relatedPeople'):
            meta_items.append(f'<div class="note-info-meta-item">👥 相关人员: {HtmlExportService._escape_html(note_info["relatedPeople"])}</div>')
        
        if note_info.get('location'):
            meta_items.append(f'<div class="note-info-meta-item">📍 地点: {HtmlExportService._escape_html(note_info["location"])}</div>')
        
        if note_info.get('startTime'):
            meta_items.append(f'<div class="note-info-meta-item">⏰ 开始: {HtmlExportService._escape_html(note_info["startTime"])}</div>')
        
        if note_info.get('endTime'):
            meta_items.append(f'<div class="note-info-meta-item">⏱️ 结束: {HtmlExportService._escape_html(note_info["endTime"])}</div>')
        
        if meta_items:
            parts.append('<div class="note-info-meta">')
            parts.extend(meta_items)
            parts.append('</div>')
        
        parts.append('</div>')
        
        return '\n'.join(parts)
    
    @staticmethod
    def _format_summary_block_html(block: Dict[str, Any]) -> str:
        """格式化小结块为 HTML"""
        content = HtmlExportService._escape_html(block.get('content', ''))
        paragraphs = [f'<p>{line}</p>' for line in content.split('\n') if line.strip()]
        
        return f'''<div class="summary-block">
    <h4>📝 小结</h4>
    {''.join(paragraphs)}
</div>'''
    
    @staticmethod
    def _format_block_html(block: Dict[str, Any], data_dir: Path) -> str:
        """格式化普通块为 HTML"""
        block_type = block.get('type')
        content = block.get('content', '').strip()
        
        if not content and block_type != 'image':
            return ''
        
        escaped_content = HtmlExportService._escape_html(content)
        
        if block_type == 'paragraph':
            return f'<p>{escaped_content}</p>'
        
        elif block_type == 'h1':
            return f'<h1>{escaped_content}</h1>'
        
        elif block_type == 'h2':
            return f'<h2>{escaped_content}</h2>'
        
        elif block_type == 'h3':
            return f'<h3>{escaped_content}</h3>'
        
        elif block_type == 'bulleted-list':
            return f'<ul><li>{escaped_content}</li></ul>'
        
        elif block_type == 'numbered-list':
            return f'<ol><li>{escaped_content}</li></ol>'
        
        elif block_type == 'code':
            return f'<pre><code>{escaped_content}</code></pre>'
        
        elif block_type == 'image':
            return HtmlExportService._format_image_html(block, data_dir)
        
        return ''
    
    @staticmethod
    def _format_image_html(block: Dict[str, Any], data_dir: Path) -> str:
        """格式化图片块为 HTML（Base64 嵌入）"""
        image_url = block.get('imageUrl', '')
        image_caption = block.get('imageCaption', '图片')
        
        if not image_url:
            return ''
        
        # 读取图片并转为 Base64
        try:
            # 构建图片完整路径
            if not image_url.startswith('http'):
                image_path = data_dir / image_url
            else:
                # 如果是 HTTP URL，跳过
                return f'<img src="{image_url}" alt="{HtmlExportService._escape_html(image_caption)}" />'
            
            if not image_path.exists():
                return f'<p style="color: red;">图片不存在: {HtmlExportService._escape_html(image_url)}</p>'
            
            # 读取图片内容
            with open(image_path, 'rb') as img_file:
                image_data = img_file.read()
            
            # 获取图片 MIME 类型
            ext = image_path.suffix.lower()
            mime_types = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
            }
            mime_type = mime_types.get(ext, 'image/png')
            
            # Base64 编码
            base64_data = base64.b64encode(image_data).decode('utf-8')
            data_uri = f"data:{mime_type};base64,{base64_data}"
            
            # 生成 HTML
            html = f'<img src="{data_uri}" alt="{HtmlExportService._escape_html(image_caption)}" />'
            
            if image_caption:
                html += f'\n<span class="image-caption">{HtmlExportService._escape_html(image_caption)}</span>'
            
            return html
            
        except Exception as e:
            return f'<p style="color: red;">图片加载失败: {HtmlExportService._escape_html(str(e))}</p>'
    
    @staticmethod
    def _escape_html(text: str) -> str:
        """转义 HTML 特殊字符"""
        if not text:
            return ''
        
        return (text
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&#39;'))

